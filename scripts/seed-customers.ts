import "dotenv/config"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../generated/prisma/client"

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

const SEED: {
  code: string
  name: string
  stage: string
  contactName: string
  contactPosition: string | null
  contactPhone: string
  contactEmail: string | null
  interestedRooms: string[]
  contractNo: string | null
  contractStart: Date | null
  contractEnd: Date | null
  note: string
}[] = [
  {
    code: "CUST-001",
    name: "National Telecom",
    stage: "RENTING",
    contactName: "คุณสมชาย ใจดี",
    contactPosition: "ผู้จัดการฝ่ายโครงข่าย",
    contactPhone: "08X-XXX-XXXX",
    contactEmail: "contracts@nt.co.th",
    interestedRooms: ["PKB-B01-F03-R01"],
    contractNo: "NT-2026-001",
    contractStart: new Date("2026-01-01"),
    contractEnd: new Date("2028-12-31"),
    note: "ผู้ให้บริการเคเบิลใต้น้ำ AAG",
  },
  {
    code: "CUST-002",
    name: "AIS",
    stage: "ROOM_INQUIRY",
    contactName: "คุณวิชัย แซ่ลิ้ม",
    contactPosition: "วิศวกรโครงข่าย",
    contactPhone: "08X-XXX-XXXX",
    contactEmail: "siteops@ais.co.th",
    interestedRooms: ["SKA-B01-F02-R02"],
    contractNo: null,
    contractStart: null,
    contractEnd: null,
    note: "นัดดูห้องแล้ว รอใบเสนอราคา",
  },
  {
    code: "CUST-003",
    name: "True IDC",
    stage: "RENTING",
    contactName: "คุณกมลทิพย์ ศรีทอง",
    contactPosition: "ผู้จัดการศูนย์ข้อมูล",
    contactPhone: "08X-XXX-XXXX",
    contactEmail: "trueidc@truecorp.co.th",
    interestedRooms: ["PKB-B01-F02-R02", "PKB-B01-F02-R03"],
    contractNo: "TRUE-2025-001",
    contractStart: new Date("2025-03-01"),
    contractEnd: new Date("2027-02-28"),
    note: "",
  },
  {
    code: "CUST-004",
    name: "UniNet (มหาวิทยาลัยสงขลานครินทร์)",
    stage: "ROOM_INQUIRY",
    contactName: "คุณนภัสสร เจริญผล",
    contactPosition: "เจ้าหน้าที่ประสานงาน",
    contactPhone: "08X-XXX-XXXX",
    contactEmail: "uninet@psu.ac.th",
    interestedRooms: ["PKB-B01-F02-R01"],
    contractNo: null,
    contractStart: null,
    contractEnd: null,
    note: "กำลังเปรียบเทียบราคากับผู้ให้บริการอื่น",
  },
  {
    code: "CUST-005",
    name: "บริษัท ทีเอสซี เทคโนโลยี จำกัด",
    stage: "INQUIRY",
    contactName: "คุณธนกร พูลสวัสดิ์",
    contactPosition: "ผู้จัดการโครงการ",
    contactPhone: "08X-XXX-XXXX",
    contactEmail: "admin@tsc-tech.co.th",
    interestedRooms: [],
    contractNo: null,
    contractStart: null,
    contractEnd: null,
    note: "มาสอบถามข้อมูลทั่วไป รอส่งเอกสารแนะนำสถานี",
  },
]

async function main() {
  let created = 0
  let updated = 0
  for (const item of SEED) {
    const { code, ...rest } = item
    const existing = await prisma.customer.findUnique({ where: { code } })
    if (existing) {
      await prisma.customer.update({
        where: { code },
        data: { ...rest, interestedRooms: rest.interestedRooms },
      })
      updated++
    } else {
      await prisma.customer.create({ data: { code, ...rest, interestedRooms: rest.interestedRooms } })
      created++
    }
  }

  // Keep the issued-code counter at or above the highest seeded code, otherwise a
  // fresh database would hand out CUST-001 again on the first UI create.
  const highestSeeded = SEED.reduce(
    (max, item) => Math.max(max, Number(item.code.replace(/^CUST-/, "")) || 0),
    0,
  )
  const seq = await prisma.codeSequence.findUnique({ where: { prefix: "CUST" } })
  if (!seq) {
    await prisma.codeSequence.create({ data: { prefix: "CUST", lastValue: highestSeeded } })
  } else if (seq.lastValue < highestSeeded) {
    await prisma.codeSequence.update({
      where: { prefix: "CUST" },
      data: { lastValue: highestSeeded },
    })
  }

  console.log(`created=${created} updated=${updated}`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
