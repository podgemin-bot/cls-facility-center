import "dotenv/config"
import * as path from "node:path"
import * as XLSX from "xlsx"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../generated/prisma/client"

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL!) })
const OUT = path.join(__dirname, "..", "..", "CLS from AGY", "CLS_Master_Database.xlsx")

const ROOM_STATUS_TH: Record<string, string> = {
  VACANT: "ว่าง",
  OCCUPIED: "มีผู้ใช้งาน",
  MAINTENANCE: "ซ่อมบำรุง",
  RESERVED: "จอง",
}
const ASSET_STATUS_TH: Record<string, string> = {
  Active: "ปกติ",
  Standby: "สำรอง",
  Maintenance: "ซ่อมบำรุง",
  Check: "ตรวจสอบ",
  แจ้งเตือน: "แจ้งเตือน",
}
const STAGE_TH: Record<string, string> = {
  INQUIRY: "สอบถามทั่วไป",
  ROOM_INQUIRY: "สอบถามห้องว่าง",
  RENTING: "เช่าห้อง",
  CLOSED: "ปิดการติดต่อ",
}
const SCOPE_TH: Record<string, string> = {
  STATION: "สถานี",
  BUILDING: "อาคาร",
  FLOOR: "ชั้น",
  ROOM: "ห้อง",
}

const dash = (v: unknown): string | number | null =>
  v === null || v === undefined || v === ""
    ? "-"
    : typeof v === "string" || typeof v === "number"
      ? v
      : String(v)

const dateStr = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 10) : null

function derivedBtu(btuTotal: number | null, unitsTotal: number | null): number | null {
  if (btuTotal == null) return null
  return unitsTotal != null && unitsTotal > 1 ? Math.round(btuTotal / unitsTotal) : btuTotal
}

function btuDisplay(btu: string | null, btuTotal: number | null, unitsTotal: number | null): number | string | null {
  if (btu) {
    const m = btu.match(/[\d,]+/)
    if (m) {
      const n = Number(m[0].replace(/,/g, ""))
      if (!Number.isNaN(n)) return n
    }
    return btu
  }
  return derivedBtu(btuTotal, unitsTotal)
}

function sheet(rows: Record<string, unknown>[]): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet(rows)
}

async function main() {
  // ---------- 1. sites + buildings ----------
  const sites = await prisma.site.findMany({
    orderBy: { code: "asc" },
    include: { buildings: { orderBy: { code: "asc" }, include: { floors: true } } },
  })
  const siteRows: Record<string, unknown>[] = []
  let seq = 0
  for (const s of sites) {
    for (const b of s.buildings) {
      seq++
      siteRows.push({
        ลำดับ: seq,
        รหัสสถานี: s.code,
        ชื่อสถานี: s.name,
        จังหวัด: s.province,
        รหัสอาคาร: b.code,
        ชื่ออาคาร: b.name,
        จำนวนชั้น: b.floors.length,
        "พิกัด Lat": s.lat,
        "พิกัด Lng": s.lng,
      })
    }
  }

  // ---------- 2. rooms ----------
  const rooms = await prisma.room.findMany({
    orderBy: [{ floor: { building: { site: { code: "asc" } } } }, { floor: { building: { code: "asc" } } }, { floor: { level: "asc" } }, { no: "asc" }],
    include: { floor: { include: { building: { include: { site: true } } } } },
  })
  const roomRows = rooms.map((r, i) => ({
    ลำดับ: i + 1,
    สถานี: r.floor.building.site.code,
    อาคาร: r.floor.building.code,
    ชั้น: r.floor.label,
    รหัสห้อง: r.code,
    ชื่อห้อง: r.name,
    "พื้นที่รวม (ตร.ม.)": dash(r.areaSqm),
    "ความสูงเพดาน (m)": dash(r.ceilingHeightM),
    "ความสูง Raised Floor (cm)": dash(r.raisedFloorCm),
    "Floor Load (kg/m²)": dash(r.floorLoadKgm2),
    สถานะการใช้: ROOM_STATUS_TH[r.status] ?? r.status,
    "ผู้ถือครอง / ผู้เช่า": dash(r.tenant),
  }))

  // ---------- 3. power assets ----------
  const power = await prisma.asset.findMany({
    where: { category: "POWER" },
    orderBy: { code: "asc" },
    include: { room: { include: { floor: { include: { building: { include: { site: true } } } } } }, floor: { include: { building: { include: { site: true } } } } },
  })
  const powerRows = power.map((a, i) => {
    const loc = a.room?.floor ?? a.floor
    return {
      ลำดับ: i + 1,
      สถานี: loc?.building.site.code ?? "-",
      อาคาร: loc?.building.code ?? "-",
      ชั้น: loc?.label ?? "-",
      รหัสอุปกรณ์: a.code,
      ชื่ออุปกรณ์: a.name,
      ประเภท: dash((a.specs as { type?: string } | null)?.type),
      ยี่ห้อ: dash(a.brand),
      รุ่น: dash(a.model),
      ความจุ: dash((a.specs as { capacity?: string } | null)?.capacity),
      Load: dash((a.specs as { load?: string } | null)?.load),
      สถานะระบบ: a.status ? (ASSET_STATUS_TH[a.status] ?? a.status) : "-",
      หมายเหตุ: dash(a.note),
    }
  })

  // ---------- 4. cooling assets ----------
  const cooling = await prisma.asset.findMany({
    where: { category: "COOLING" },
    orderBy: { code: "asc" },
    include: { room: { include: { floor: { include: { building: { include: { site: true } } } } } } },
  })
  const coolingRows = cooling.map((a, i) => {
    const s = (a.specs ?? {}) as {
      type?: string | null
      btu?: string | null
      btuTotal?: number | null
      unitsTotal?: number | null
      unitsReady?: number | null
      unitsDown?: number | null
      efficiencyPct?: number | null
    }
    return {
      ลำดับ: i + 1,
      สถานี: a.room?.floor.building.site.code ?? "-",
      รหัสห้อง: a.room?.code ?? "-",
      รหัสอุปกรณ์: a.code,
      ชื่ออุปกรณ์: a.name,
      ประเภท: dash(s.type),
      BTU: dash(btuDisplay(s.btu ?? null, s.btuTotal ?? null, s.unitsTotal ?? null)),
      "BTU รวม": dash(s.btuTotal),
      ชุดรวม: dash(s.unitsTotal),
      ชุดพร้อมใช้: dash(s.unitsReady),
      ชุดเสีย: dash(s.unitsDown),
      "ประสิทธิภาพ (%)": dash(s.efficiencyPct),
      รุ่น: dash(a.model),
      สถานะระบบ: a.status ? (ASSET_STATUS_TH[a.status] ?? a.status) : "-",
      หมายเหตุ: dash(a.note),
    }
  })

  // ---------- 5. security ----------
  const security = await prisma.roomSecurity.findMany({
    orderBy: [{ room: { floor: { building: { site: { code: "asc" } } } } }, { room: { floor: { building: { code: "asc" } } } }, { room: { floor: { level: "asc" } } }, { room: { no: "asc" } }],
    include: { room: { include: { floor: { include: { building: { include: { site: true } } } } } } },
  })
  const securityRows = security.map((sec, i) => ({
    ลำดับ: i + 1,
    สถานี: sec.room.floor.building.site.code,
    อาคาร: sec.room.floor.building.code,
    ชั้น: sec.room.floor.label,
    รหัสห้อง: sec.room.code,
    ชื่อห้อง: sec.room.name,
    "จำนวน CCTV (ตัว)": dash(sec.cctvCount),
    "ระบบ Access Control": dash(sec.accessControl),
    "ระบบดับเพลิง (Fire Gas Agent)": dash(sec.fireSuppression),
    "ระบบตรวจจับควัน VESDA": dash(sec.vesda),
  }))

  // ---------- 6. certificates ----------
  const certs = await prisma.certificate.findMany({
    orderBy: { code: "asc" },
    include: { site: true },
  })
  const certRows = certs.map((c, i) => ({
    ลำดับ: i + 1,
    สถานี: c.site.code,
    รหัสใบรับรอง: c.code,
    ระดับการรับรอง: SCOPE_TH[c.scope] ?? c.scope,
    "ชื่อใบรับรอง/มาตรฐาน": c.name,
    หน่วยงานผู้ออก: dash(c.issuer),
    เลขที่ใบรับรอง: dash(c.certNo),
    วันออกใบรับรอง: dateStr(c.issuedAt),
    วันหมดอายุ: dateStr(c.expiresAt),
    รายละเอียด: dash(c.detail),
  }))

  // ---------- 7. customers ----------
  const customers = await prisma.customer.findMany({ orderBy: { code: "asc" } })
  const customerRows = customers.map((c, i) => ({
    ลำดับ: i + 1,
    รหัสลูกค้า: c.code,
    ชื่อผู้บริการ: c.name,
    ขั้นตอน: STAGE_TH[c.stage] ?? c.stage,
    ผู้ติดต่อ: c.contactName,
    "ตำแหน่งลูกค้า": dash(c.contactPosition),
    เบอร์โทร: c.contactPhone,
    อีเมล: dash(c.contactEmail),
    วันที่สอบถาม: dateStr(c.inquiryDate),
    ห้องที่สนใจ: Array.isArray(c.interestedRooms) && c.interestedRooms.length > 0 ? (c.interestedRooms as string[]).join(", ") : "-",
    เลขสัญญา: dash(c.contractNo),
    วันเริ่มสัญญา: dateStr(c.contractStart),
    วันสิ้นสุดสัญญา: dateStr(c.contractEnd),
    หมายเหตุ: dash(c.note),
  }))

  // ---------- 8. floor plan pins ----------
  const pins = await prisma.photoPoint.findMany({
    orderBy: [{ room: { floor: { building: { site: { code: "asc" } } } } }, { room: { floor: { building: { code: "asc" } } } }, { room: { floor: { level: "asc" } } }, { seqOnFloor: "asc" }],
    include: { room: { include: { floor: { include: { building: { include: { site: true } } } } } } },
  })
  const pinRows = pins.map((p, i) => ({
    ลำดับ: i + 1,
    รหัสหมุด: p.code,
    สถานี: p.room.floor.building.site.code,
    อาคาร: p.room.floor.building.code,
    ชั้น: p.room.floor.label,
    เลขหมุดประจำชั้น: p.seqOnFloor,
    "พิกัด X (%)": dash(p.x),
    "พิกัด Y (%)": dash(p.y),
    รหัสห้องผูกพัน: p.room.code,
  }))

  // ---------- 9. users ----------
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })
  const userRows = users.map((u, i) => ({
    ลำดับ: i + 1,
    "ชื่อ-นามสกุล": u.name,
    อีเมล: u.email,
    "สิทธิ์การใช้ (Role)": u.role,
    ยืนยันอีเมล: u.emailVerified ? "ใช้" : "ไม่ใช่",
    สมัครเมื่อ: dateStr(u.createdAt),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet(siteRows), "1_โครงสร้างสถานีและอาคาร")
  XLSX.utils.book_append_sheet(wb, sheet(roomRows), "2_ผังห้องและสเปกกายภาพ")
  XLSX.utils.book_append_sheet(wb, sheet(powerRows), "3_อุปกรณ์ระบบไฟฟ้า")
  XLSX.utils.book_append_sheet(wb, sheet(coolingRows), "4_อุปกรณ์ปรับอากาศ")
  XLSX.utils.book_append_sheet(wb, sheet(securityRows), "5_อุปกรณ์ความปลอดภัย")
  XLSX.utils.book_append_sheet(wb, sheet(certRows), "6_ใบรับรองมาตรฐาน")
  XLSX.utils.book_append_sheet(wb, sheet(customerRows), "7_ลูกค้าและสัญญาเช่า")
  XLSX.utils.book_append_sheet(wb, sheet(pinRows), "8_พิกัดหมุดผังชั้น")
  XLSX.utils.book_append_sheet(wb, sheet(userRows), "9_ผู้ใช้ระบบ")
  XLSX.writeFile(wb, OUT)

  console.log(
    `written: sites=${siteRows.length} rooms=${roomRows.length} power=${powerRows.length} cooling=${coolingRows.length} security=${securityRows.length} certs=${certRows.length} customers=${customerRows.length} pins=${pinRows.length} users=${userRows.length}`,
  )
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
