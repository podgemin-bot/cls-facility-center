import "dotenv/config";

import { readFileSync } from "node:fs";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import prisma from "../src/lib/prisma";

const email = process.argv[2]?.trim().toLowerCase();

/**
 * รหัสผ่านมาจาก 2 ช่องทาง (เรียงตามลำดับ):
 *  1. `NEW_PASSWORD=...` — สำหรับ automation (ระวังตกใน shell history / CI log)
 *  2. stdin บรรทัดแรก — ปลอดภัยกว่า เช่น
 *     `Get-Content -Raw pw.txt | npm run user:reset -- admin@cls.local`
 *     `echo "$PW" | npx tsx scripts/reset-password.ts admin@cls.local`
 *
 * ไม่มีการรับรหัสผ่านเป็น argv และไม่มีการ log รหัสผ่าน/ hash ออกทาง stdout
 */
function readPasswordFromStdin(): string {
  try {
    return readFileSync(0, "utf8").split(/\r?\n/, 1)[0]?.trim() ?? "";
  } catch {
    return "";
  }
}

const password = (process.env.NEW_PASSWORD ?? readPasswordFromStdin()).trim();

if (!email) {
  console.error("usage: tsx scripts/reset-password.ts <email> (NEW_PASSWORD=... | pipe password via stdin)");
  process.exit(1);
}

if (!password) {
  console.error("no password provided: set NEW_PASSWORD or pipe it through stdin");
  process.exit(1);
}

if (password.length < 8) {
  console.error("password must be at least 8 characters");
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, name: true, accounts: { select: { id: true, providerId: true } } },
  });

  if (!user) {
    console.error(`user not found: ${email}`);
    process.exit(1);
  }

  const credential = user.accounts.find((a) => a.providerId === "credential");
  if (!credential) {
    console.error(`no credential account for ${email}`);
    process.exit(1);
  }

  console.warn("direct DB password reset: bypasses the admin UI and any UI audit trail");

  const passwordHash = await hashPassword(password);
  const verified = await verifyPassword({ hash: passwordHash, password });
  if (!verified) {
    throw new Error("self-verification of new hash failed");
  }

  await prisma.account.update({
    where: { id: credential.id },
    data: { password: passwordHash },
  });

  const revoked = await prisma.session.deleteMany({ where: { userId: user.id } });

  console.log(`email=${user.email}`);
  console.log(`role=${user.role}`);
  console.log(`hash_verified=true`);
  console.log(`revoked_sessions=${revoked.count}`);
  if (revoked.count > 0) console.warn("existing sessions were revoked — the user must sign in again");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
