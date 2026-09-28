import "dotenv/config";

import prisma from "../src/lib/prisma";

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`user_count=${users.length}`);
  for (const user of users) {
    console.log(
      [
        user.email,
        user.role,
        user.name,
        user.createdAt.toISOString(),
      ].join(" | ")
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
