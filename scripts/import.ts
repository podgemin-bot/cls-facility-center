import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import * as XLSX from "xlsx"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../generated/prisma/client"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(__dirname, "..")
const WORKSPACE = path.resolve(APP_ROOT, "..")
const XLSX_PATH = path.join(WORKSPACE, "CLS from AGY", "CLS_Master_Database_Original.xlsx")
const STORAGE_SRC = path.join(WORKSPACE, "CLS from AGY", "storage")
const PRIVATE_STORAGE = path.resolve(process.env.PRIVATE_STORAGE_ROOT || path.join(APP_ROOT, ".data"))

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

type Row = (string | number | Date | null)[]

function cell(rows: Row[], r: number, c: number): string | number | Date | null {
  const row = rows[r]
  if (!row) return null
  const v = row[c]
  return v === undefined ? null : v
}

function str(v: string | number | Date | null): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s || s === "-") return null
  return s
}

function num(v: string | number | Date | null): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (!s || s === "-") return null
  const cleaned = s.replace(/,/g, "").replace(/%/g, "")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function dateVal(v: string | number | Date | null): Date | null {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s || s === "-") return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function parseLevel(label: string | number | Date | null): number | null {
  const s = str(label)
  if (!s) return null
  const m = s.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

const pad2 = (n: number) => String(n).padStart(2, "0")
const pad3 = (n: number) => String(n).padStart(3, "0")

const VALUE_MAPS = {
  access: {
    "RFID Card + PIN Code": "RFID Proximity Card, PIN Code",
    "pin+Card": "PIN Code, RFID Proximity Card",
  } as Record<string, string>,
  fire: {
    FM200: "FM-200 (HFC-227ea)",
  } as Record<string, string>,
  vesda: {
    yes: "VESDA",
    "มี (Installed)": "VESDA",
    "ไม่มี (N/A)": "ไม่ติดตั้ง",
  } as Record<string, string>,
}

function normalizeAccess(v: string | null): string | null {
  if (!v) return null
  return VALUE_MAPS.access[v] ?? v
}

function normalizeFire(v: string | null): string | null {
  if (!v) return null
  return VALUE_MAPS.fire[v] ?? v
}

function normalizeVesda(v: string | null): string | null {
  if (!v) return null
  return VALUE_MAPS.vesda[v] ?? v
}

const STATUS_MAP: Record<string, "VACANT" | "OCCUPIED" | "MAINTENANCE" | "RESERVED"> = {
  "มีผู้ใช้งาน": "OCCUPIED",
  "กำลังใช้งาน": "OCCUPIED",
  "ว่าง": "VACANT",
  "ว่างอยู่": "VACANT",
  "ซ่อมบำรุง": "MAINTENANCE",
  "อยู่ระหว่างซ่อมบำรุง": "MAINTENANCE",
  "จอง": "RESERVED",
  "ถูกจอง": "RESERVED",
}

function mapStatus(v: string | number | Date | null): "VACANT" | "OCCUPIED" | "MAINTENANCE" | "RESERVED" {
  const s = str(v)
  if (s && STATUS_MAP[s]) return STATUS_MAP[s]
  return "OCCUPIED"
}

let filesCopied = 0

function copyFile(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  filesCopied++
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("scripts/import.ts is destructive and must not run in production")
  }
  console.log("Reading workbook:", XLSX_PATH)
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true })

  const sheetRows = (idx: number): Row[] =>
    XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[idx]], { header: 1, defval: null, raw: true })

  const sites = sheetRows(0)
  const rooms = sheetRows(1)
  const power = sheetRows(2)
  const cooling = sheetRows(3)
  const security = sheetRows(4)
  const certs = sheetRows(5)
  const pins = sheetRows(7)

  console.log("Clearing existing CLS data...")
  await prisma.photoPoint.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.roomSecurity.deleteMany()
  await prisma.certificate.deleteMany()
  await prisma.room.deleteMany()
  await prisma.floor.deleteMany()
  await prisma.building.deleteMany()
  await prisma.site.deleteMany()

  const siteIds = new Map<string, number>()
  const buildingIds = new Map<string, number>()
  const floorIds = new Map<string, number>()
  const roomIds = new Map<string, number>()

  for (let r = 1; r < sites.length; r++) {
    const code = str(cell(sites, r, 1))
    if (!code) continue
    const site = await prisma.site.create({
      data: {
        code,
        name: str(cell(sites, r, 2)) ?? code,
        province: str(cell(sites, r, 4)) ?? "",
        lat: num(cell(sites, r, 8)),
        lng: num(cell(sites, r, 9)),
      },
    })
    siteIds.set(code, site.id)

    const bldgCode = str(cell(sites, r, 5))
    if (bldgCode) {
      const b = await prisma.building.create({
        data: { siteId: site.id, code: bldgCode, name: str(cell(sites, r, 6)) ?? bldgCode },
      })
      buildingIds.set(bldgCode, b.id)
    }
  }

  for (let r = 1; r < rooms.length; r++) {
    const roomCode = str(cell(rooms, r, 4))
    if (!roomCode) continue
    const parts = roomCode.split("-")
    const bldgCode = `${parts[0]}-${parts[1]}`
    const level = parseLevel(cell(rooms, r, 3))
    if (level === null) throw new Error(`Cannot parse floor label at rooms row ${r + 1}`)
    const floorCode = `${bldgCode}-F${pad2(level)}`

    let buildingId = buildingIds.get(bldgCode)
    if (!buildingId) {
      const b = await prisma.building.create({
        data: { siteId: siteIds.get(parts[0])!, code: bldgCode, name: bldgCode },
      })
      buildingIds.set(bldgCode, b.id)
      buildingId = b.id
    }

    let floorId = floorIds.get(floorCode)
    if (!floorId) {
      const f = await prisma.floor.create({
        data: { buildingId, level, code: floorCode, label: `ชั้น ${level}` },
      })
      floorIds.set(floorCode, f.id)
      floorId = f.id
    }

    const room = await prisma.room.create({
      data: {
        floorId,
        code: roomCode,
        no: parseInt(parts[3].replace("R", ""), 10),
        name: str(cell(rooms, r, 5)) ?? roomCode,
        areaSqm: num(cell(rooms, r, 7)),
        ceilingHeightM: num(cell(rooms, r, 8)),
        raisedFloorCm: num(cell(rooms, r, 9)),
        floorLoadKgm2: num(cell(rooms, r, 10)),
        status: mapStatus(cell(rooms, r, 11)),
        tenant: str(cell(rooms, r, 12)),
      },
    })
    roomIds.set(roomCode, room.id)
  }

  for (let r = 1; r < security.length; r++) {
    const roomCode = str(cell(security, r, 4))
    const roomId = roomCode ? roomIds.get(roomCode) : undefined
    if (!roomId) continue
    await prisma.roomSecurity.create({
      data: {
        roomId,
        cctvCount: num(cell(security, r, 6)),
        accessControl: normalizeAccess(str(cell(security, r, 7))),
        fireSuppression: normalizeFire(str(cell(security, r, 8))),
        vesda: normalizeVesda(str(cell(security, r, 10))),
      },
    })
  }

  const assetCounters = new Map<string, number>()
  const nextAssetCode = (prefix: string, site: string) => {
    const key = `${prefix}-${site}`
    const n = (assetCounters.get(key) ?? 0) + 1
    assetCounters.set(key, n)
    return `${key}-${pad3(n)}`
  }

  for (let r = 1; r < power.length; r++) {
    const legacy = str(cell(power, r, 4))
    if (!legacy) continue
    const site = str(cell(power, r, 1))!
    const bldgCode = `${site}-B01`
    const level = parseLevel(cell(power, r, 3)) ?? 1
    const floorId = floorIds.get(`${bldgCode}-F${pad2(level)}`) ?? null
    await prisma.asset.create({
      data: {
        category: "POWER",
        code: nextAssetCode("PWR", site),
        legacyCode: legacy,
        name: str(cell(power, r, 5)) ?? legacy,
        brand: str(cell(power, r, 7)),
        model: str(cell(power, r, 8)),
        status: str(cell(power, r, 10)),
        specs: { type: str(cell(power, r, 6)), capacity: str(cell(power, r, 9)) },
        floorId,
      },
    })
  }

  for (let r = 1; r < cooling.length; r++) {
    const legacy = str(cell(cooling, r, 5))
    if (!legacy) continue
    const site = str(cell(cooling, r, 1))!
    const roomId = roomIds.get(str(cell(cooling, r, 4)) ?? "") ?? null
    await prisma.asset.create({
      data: {
        category: "COOLING",
        code: nextAssetCode("COOL", site),
        legacyCode: legacy,
        name: str(cell(cooling, r, 6)) ?? legacy,
        model: str(cell(cooling, r, 8)),
        specs: {
          type: str(cell(cooling, r, 7)),
          btuTotal: num(cell(cooling, r, 9)),
          unitsTotal: num(cell(cooling, r, 10)),
          unitsReady: num(cell(cooling, r, 11)),
          unitsDown: num(cell(cooling, r, 12)),
          efficiencyPct: num(cell(cooling, r, 13)),
        },
        roomId,
      },
    })
  }

  for (let r = 1; r < certs.length; r++) {
    const certCode = str(cell(certs, r, 2))
    const site = str(cell(certs, r, 1))
    if (!certCode || !site) continue
    const rawScope = (str(cell(certs, r, 3)) ?? "").toUpperCase()
    const scope = ["STATION", "BUILDING", "FLOOR", "ROOM"].includes(rawScope) ? rawScope : "STATION"

    let buildingCode: string | null = null
    let roomCode: string | null = null
    const bm = certCode.match(/-B(\d{2})$/)
    if (bm) buildingCode = `${site}-B${bm[1]}`
    const rm = certCode.match(/-(F\d{2}-R\d{2})$/)
    if (rm) roomCode = `${site}-B01-${rm[1]}`

    await prisma.certificate.create({
      data: {
        code: certCode,
        siteId: siteIds.get(site)!,
        scope: rm ? "ROOM" : bm ? "BUILDING" : scope,
        name: str(cell(certs, r, 4)) ?? certCode,
        issuer: str(cell(certs, r, 5)),
        certNo: str(cell(certs, r, 6)),
        issuedAt: dateVal(cell(certs, r, 7)),
        expiresAt: dateVal(cell(certs, r, 8)),
        detail: str(cell(certs, r, 9)),
        buildingCode,
        roomCode,
      },
    })
  }

  for (let r = 1; r < pins.length; r++) {
    const bldgCode = str(cell(pins, r, 3))
    const level = parseLevel(cell(pins, r, 4))
    const seq = num(cell(pins, r, 5))
    const bareRoom = num(cell(pins, r, 8)) ?? seq
    if (!bldgCode || level === null || seq === null || bareRoom === null) continue
    const roomCode = `${bldgCode}-F${pad2(level)}-R${pad2(bareRoom)}`
    const roomId = roomIds.get(roomCode)
    if (!roomId) {
      console.warn(`Pin row ${r + 1}: room ${roomCode} not found, skipped`)
      continue
    }
    await prisma.photoPoint.create({
      data: {
        roomId,
        code: `PT-${bldgCode}-F${pad2(level)}-${pad3(seq)}`,
        seqOnFloor: seq,
        x: num(cell(pins, r, 6)),
        y: num(cell(pins, r, 7)),
      },
    })
  }

  console.log("Copying & renaming images...")
  if (fs.existsSync(PRIVATE_STORAGE)) fs.rmSync(PRIVATE_STORAGE, { recursive: true, force: true })

  const plansSrc = path.join(STORAGE_SRC, "03_Floor_Plans")
  if (fs.existsSync(plansSrc)) {
    for (const siteDir of fs.readdirSync(plansSrc)) {
      const sitePath = path.join(plansSrc, siteDir)
      if (!fs.statSync(sitePath).isDirectory()) continue
      for (const lvlDir of fs.readdirSync(sitePath)) {
        const level = parseLevel(lvlDir)
        if (level === null) continue
        const lvlPath = path.join(sitePath, lvlDir)
        for (const f of fs.readdirSync(lvlPath)) {
          if (!/\.(png|jpg|jpeg)$/i.test(f)) continue
          const ext = path.extname(f).toLowerCase()
          const floorCode = `${siteDir}-B01-F${pad2(level)}`
          const floorId = floorIds.get(floorCode)
          if (floorId) {
            const filename = `F${pad2(level)}${ext}`
            copyFile(path.join(lvlPath, f), path.join(PRIVATE_STORAGE, "floor-plans", String(floorId), filename))
            await prisma.floor.update({ where: { id: floorId }, data: { planImage: filename } })
          }
        }
      }
    }
  }

  const photosSrc = path.join(STORAGE_SRC, "04_Room_Photos")
  if (fs.existsSync(photosSrc)) {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry)
          if (fs.statSync(full).isDirectory()) {
            if (/^[A-Z]{3}-B\d{2}-F\d{2}-R\d{2}$/.test(entry)) {
              const roomId = roomIds.get(entry)
              if (!roomId) throw new Error(`No room matches photo directory: ${entry}`)
              for (const f of fs.readdirSync(full)) {
              if (!/\.(jpg|jpeg|png)$/i.test(f)) continue
              const ext = path.extname(f).toLowerCase()
              const m = f.match(/-(\d+)\.(jpg|jpeg|png)$/i)
              const baseName = /GEN/i.test(f) ? `gen${ext}` : m ? `${pad2(parseInt(m[1], 10))}${ext}` : f.toLowerCase()
              copyFile(path.join(full, f), path.join(PRIVATE_STORAGE, "room-photos", String(roomId), baseName))
            }
          } else {
            for (const f of fs.readdirSync(full)) {
              if (!/\.(jpg|jpeg|png)$/i.test(f)) continue
              if (fs.statSync(path.join(full, f)).isFile()) {
                console.warn(`Skipping extra photo outside room folder: ${path.join(full, f)}`)
              }
            }
            walk(full)
          }
        }
      }
    }
    walk(photosSrc)
  }

  const [cSites, cBuildings, cFloors, cRooms, cAssets, cSec, cCerts, cPins] = await Promise.all([
    prisma.site.count(),
    prisma.building.count(),
    prisma.floor.count(),
    prisma.room.count(),
    prisma.asset.count(),
    prisma.roomSecurity.count(),
    prisma.certificate.count(),
    prisma.photoPoint.count(),
  ])

  console.log("\n=== IMPORT SUMMARY ===")
  console.log(`Sites:         ${cSites}   (expect 2)`)
  console.log(`Buildings:     ${cBuildings}   (expect 2)`)
  console.log(`Floors:        ${cFloors}   (expect 7)`)
  console.log(`Rooms:         ${cRooms}  (expect 62)`)
  console.log(`Assets:        ${cAssets}   (expect 30)`)
  console.log(`RoomSecurity:  ${cSec}  (expect 62)`)
  console.log(`Certificates:  ${cCerts}   (expect 7)`)
  console.log(`PhotoPoints:   ${cPins}  (expect 62)`)
  console.log(`Image files copied: ${filesCopied}`)
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
