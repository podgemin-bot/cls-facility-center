import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const byCat = await prisma.asset.groupBy({ by: ["category"], _count: { _all: true } });
  console.log("byCategory:", byCat);
  const power = await prisma.asset.findMany({ where: { category: "POWER" }, select: { id: true, code: true, status: true, floorId: true, roomId: true } });
  console.log("powerWithRoom:", power.filter((a) => a.roomId != null).length);
  console.log("powerWithoutRoom:", power.filter((a) => a.roomId == null).length);
  console.log("power statuses:", [...new Set(power.map((a) => a.status ?? "null"))]);
  console.log("sample:", power.slice(0, 5));
}

main().finally(() => prisma.$disconnect());