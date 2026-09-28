#!/usr/bin/env node
/**
 * Rewrite a Windows-produced mariadb dump so it is safe to restore on Linux.
 *
 * The dev database runs MariaDB with lower_case_table_names=1 (Windows), so a
 * dump of it stores every table name lowercase (`roomsecurity`, `site`, ...).
 * Production runs lower_case_table_names=0 and Prisma looks tables up by the
 * exact case from the schema (`RoomSecurity`, `Site`, ...). Restoring the raw
 * dump there would create a database the app cannot query.
 *
 * This tool re-cases only the *table-name identifiers* that appear where a
 * statement names its table (CREATE/DROP/LOCK/ALTER/RENAME TABLE, INSERT INTO,
 * REPLACE INTO) to the exact CREATE TABLE names found in prisma/migrations.
 * Column names and data values are identifiers that are case-insensitive or
 * must be left alone, so nothing else is touched.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

const usage = "usage: node scripts/portable-dump.mjs <in.sql.gz> <out.sql.gz> [--migrations <dir>]";
const [, , input, output, , migrationsArg] = process.argv;
if (!input || !output) {
  console.error(usage);
  process.exit(2);
}
const migrationsDir = migrationsArg ?? path.resolve(import.meta.dirname, "..", "prisma", "migrations");

function readStmtNames() {
  const names = new Set();
  if (!fs.existsSync(migrationsDir)) return names;
  for (const dir of fs.readdirSync(migrationsDir)) {
    const sql = path.join(migrationsDir, dir, "migration.sql");
    if (!fs.existsSync(sql)) continue;
    for (const line of fs.readFileSync(sql, "utf8").split("\n")) {
      const m = /CREATE\s+TABLE\s+`([^`]+)`/.exec(line);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

const expected = readStmtNames();
if (expected.size === 0) {
  console.error(`no CREATE TABLE names found under ${migrationsDir}`);
  process.exit(2);
}
console.error(`expected table names from migrations (${expected.size}): ${[...expected].sort().join(", ")}`);

const byLower = new Map([...expected].map((name) => [name.toLowerCase(), name]));

const leadingKeyword = /^(\s*(?:DROP\s+TABLE\s+IF\s+EXISTS|CREATE\s+TABLE|LOCK\s+TABLES|ALTER\s+TABLE|RENAME\s+TABLE|INSERT\s+INTO|REPLACE\s+INTO)\s+)/i;

function rewriteTableName(line) {
  const head = leadingKeyword.exec(line);
  if (!head) return line;
  const [, prefix] = head;
  const rest = line.slice(head.index + prefix.length);
  const m = /^`([^`]+)`/.exec(rest);
  if (!m) return line;
  const wanted = byLower.get(m[1].toLowerCase());
  if (!wanted || wanted === m[1]) return line;
  return line.slice(0, head.index) + prefix + `\`${wanted}\`` + rest.slice(m[0].length);
}

const raw = fs.createReadStream(input);
const gunzip = zlib.createGunzip();
const tmp = `${output}.tmp`;
const out = fs.createWriteStream(tmp);
const rl = readline.createInterface({ input: raw.pipe(gunzip), crlfDelay: Infinity });

let lines = 0;
let rewritten = 0;
let written = 0;
out.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

rl.on("line", (line) => {
  lines++;
  const fixed = rewriteTableName(line);
  if (fixed !== line) rewritten++;
  out.write(fixed + "\n");
  written += fixed.length + 1;
});

rl.on("close", () => {
  out.end(() => {
    const gz = zlib.createGzip();
    const readBack = fs.createReadStream(tmp);
    const finalOut = fs.createWriteStream(output);
    readBack.pipe(gz).pipe(finalOut).on("finish", () => {
      fs.rmSync(tmp, { force: true });
      console.error(`rewrote ${rewritten} statement lines of ${lines} lines (${written.toLocaleString()} bytes) -> ${output}`);
      console.error(
        `verify hints: gunzip -c ${output} | grep -c 'CREATE TABLE \`RoomSecurity\`'  (expect 1)`
      );
    });
  });
});