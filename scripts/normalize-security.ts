import "dotenv/config"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../generated/prisma/client"

const ACCESS_MAP: Record<string, string> = {
  "RFID Card + PIN Code": "RFID Proximity Card, PIN Code",
  "pin+Card": "PIN Code, RFID Proximity Card",
}

const FIRE_MAP: Record<string, string> = {
  FM200: "FM-200 (HFC-227ea)",
}

const VESDA_MAP: Record<string, string> = {
  yes: "VESDA",
  "มี (Installed)": "VESDA",
  "ไม่มี (N/A)": "ไม่ติดตั้ง",
}

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  const rows = await prisma.roomSecurity.findMany({
    select: { id: true, accessControl: true, fireSuppression: true, vesda: true },
  })
  let u = 0
  let s = 0
  for (const r of rows) {
    const next: Record<string, string | null | undefined> = {}
    if (r.accessControl) next.accessControl = ACCESS_MAP[r.accessControl] ?? r.accessControl
    if (r.fireSuppression) next.fireSuppression = FIRE_MAP[r.fireSuppression] ?? r.fireSuppression
    if (r.vesda) next.vesda = VESDA_MAP[r.vesda] ?? r.vesda
    const keys = Object.keys(next) as (keyof typeof next)[]
    if (keys.length === 0) {
      s++
      continue
    }
    await prisma.roomSecurity.update({ where: { id: r.id }, data: next })
    u++
  }
  console.log(`updated=${u} skipped=${s}`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})