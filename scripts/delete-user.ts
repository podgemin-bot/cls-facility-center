import "dotenv/config";

import prisma from "../src/lib/prisma";

const email = process.argv[2]?.trim().toLowerCase();
const confirmed = process.argv.includes("--yes");

if (!email) {
  console.error("usage: tsx scripts/delete-user.ts <email> --yes");
  process.exit(1);
}

if (!confirmed) {
  console.error("refusing to delete without --yes");
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      createdAt: true,
      accounts: { select: { id: true } },
      sessions: { select: { id: true } },
    },
  });

  if (!user) {
    console.error(`user not found: ${email}`);
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      console.error("refusing to delete the last ADMIN account");
      process.exit(1);
    }
  }

  console.warn("permanently deleting a user account (sessions and accounts cascade)");
  console.log(`email=${user.email}`);
  console.log(`role=${user.role}`);
  console.log(`name=${user.name}`);
  console.log(`created_at=${user.createdAt.toISOString()}`);
  console.log(`accounts=${user.accounts.length}`);
  console.log(`sessions=${user.sessions.length}`);

  const [, sessions, accounts] = await prisma.$transaction([
    prisma.user.delete({ where: { id: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.account.deleteMany({ where: { userId: user.id } }),
  ]);

  console.log(`deleted_sessions=${sessions.count}`);
  console.log(`deleted_accounts=${accounts.count}`);
  console.log(`remaining_users=${await prisma.user.count()}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
