import "dotenv/config"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../generated/prisma/client"

const NOT_INSTALLED = "ไม่ติดตั้ง"

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  const [fire, vesda] = await prisma.$transaction([
    prisma.roomSecurity.updateMany({
      where: { OR: [{ fireSuppression: null }, { fireSuppression: "" }] },
      data: { fireSuppression: NOT_INSTALLED },
    }),
    prisma.roomSecurity.updateMany({
      where: { OR: [{ vesda: null }, { vesda: "" }] },
      data: { vesda: NOT_INSTALLED },
    }),
  ])
  console.log(`fireSuppression=${fire.count} vesda=${vesda.count}`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})