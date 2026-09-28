import "dotenv/config";

import { spawnSync } from "node:child_process";
import path from "node:path";
import mariadb from "mariadb";

const databaseName = `cls_migrate_verify_${process.pid}`;
const appRoot = path.resolve(import.meta.dirname, "..");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const parsed = new URL(databaseUrl.replace(/^mysql:/, "mariadb:"));
  const connection = await mariadb.createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  });

  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await connection.query(
      `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    const verifyUrl = new URL(databaseUrl);
    verifyUrl.pathname = `/${databaseName}`;
    const prismaCli = path.join(appRoot, "node_modules", "prisma", "build", "index.js");
    for (let pass = 1; pass <= 2; pass++) {
      const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
        cwd: appRoot,
        env: { ...process.env, DATABASE_URL: verifyUrl.toString() },
        stdio: "inherit",
      });
      if (result.status !== 0) throw new Error(`migrate deploy pass ${pass} failed`);
    }

    const lowerCaseRows = (await connection.query(
      "SELECT @@lower_case_table_names AS value"
    )) as { value: number }[];
    const migrationRows = (await connection.query(
      `SELECT COUNT(*) AS count FROM \`${databaseName}\`.\`_prisma_migrations\` WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    )) as { count: bigint }[];
    const tableRows = (await connection.query(
      "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND BINARY TABLE_NAME = 'RoomSecurity'",
      [databaseName]
    )) as { count: bigint }[];
    const compatibleTableRows = (await connection.query(
      "SELECT COUNT(*) AS count FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'RoomSecurity'",
      [databaseName]
    )) as { count: bigint }[];
    const legacyRows = (await connection.query(
      "SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'RoomSecurity' AND COLUMN_NAME IN ('gasPressure', 'gasTankCount', 'doorLockType', 'firePanelBrand')",
      [databaseName]
    )) as { count: bigint }[];

    console.log(`lower_case_table_names=${lowerCaseRows[0]?.value}`);
    console.log(`successful_migrations=${migrationRows[0]?.count}`);
    console.log(`exact_RoomSecurity_tables=${tableRows[0]?.count}`);
    console.log(`compatible_RoomSecurity_tables=${compatibleTableRows[0]?.count}`);
    console.log(`legacy_security_columns=${legacyRows[0]?.count}`);

    const requiresExactCase = lowerCaseRows[0]?.value === 0;
    if (
      migrationRows[0]?.count !== BigInt(5) ||
      compatibleTableRows[0]?.count !== BigInt(1) ||
      (requiresExactCase && tableRows[0]?.count !== BigInt(1)) ||
      legacyRows[0]?.count !== BigInt(0)
    ) {
      throw new Error("fresh migration verification failed");
    }
  } finally {
    await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
