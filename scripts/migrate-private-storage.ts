import "dotenv/config";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import prisma from "../src/lib/prisma";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_ROOT = path.join(APP_ROOT, "public", "storage");
const STORAGE_ROOT = path.resolve(
  process.env.PRIVATE_STORAGE_ROOT?.trim() || path.join(APP_ROOT, ".data")
);
const APPLY = process.argv.includes("--apply");

type ManifestEntry = {
  source: string;
  destination: string;
  bytes: number;
  sha256: string;
};

const manifest: ManifestEntry[] = [];

function imageType(buffer: Buffer): "jpeg" | "png" | "webp" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function expectedType(filename: string): "jpeg" | "png" | "webp" | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "jpeg";
  if (ext === ".png") return "png";
  if (ext === ".webp") return "webp";
  return null;
}

const hash = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

async function copyVerified(source: string, destination: string): Promise<void> {
  const stat = await fs.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Unsafe source: ${source}`);

  const buffer = await fs.readFile(source);
  const expected = expectedType(source);
  if (!expected || imageType(buffer) !== expected) throw new Error(`Invalid image: ${source}`);

  if (APPLY) {
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    try {
      await fs.writeFile(destination, buffer, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await fs.readFile(destination);
      if (hash(existing) !== hash(buffer)) throw new Error(`Destination collision: ${destination}`);
    }
  }

  manifest.push({
    source: path.relative(APP_ROOT, source),
    destination: path.relative(STORAGE_ROOT, destination),
    bytes: buffer.byteLength,
    sha256: hash(buffer),
  });
}

async function main() {
  const publicRoot = path.resolve(APP_ROOT, "public");
  const relativeToPublic = path.relative(publicRoot, STORAGE_ROOT);
  if (!relativeToPublic || (!relativeToPublic.startsWith("..") && !path.isAbsolute(relativeToPublic))) {
    throw new Error("PRIVATE_STORAGE_ROOT must be outside public");
  }

  const rooms = await prisma.room.findMany({ select: { id: true, code: true } });
  const roomByCode = new Map(rooms.map((room) => [room.code, room.id]));
  const photosRoot = path.join(SOURCE_ROOT, "photos");
  for (const roomEntry of await fs.readdir(photosRoot, { withFileTypes: true })) {
    if (!roomEntry.isDirectory()) continue;
    const roomId = roomByCode.get(roomEntry.name);
    if (!roomId) throw new Error(`No room matches photo directory: ${roomEntry.name}`);
    const sourceDir = path.join(photosRoot, roomEntry.name);
    for (const file of await fs.readdir(sourceDir, { withFileTypes: true })) {
      if (!file.isFile()) throw new Error(`Unexpected photo entry: ${path.join(sourceDir, file.name)}`);
      await copyVerified(
        path.join(sourceDir, file.name),
        path.join(STORAGE_ROOT, "room-photos", String(roomId), file.name)
      );
    }
  }

  const floors = await prisma.floor.findMany({
    where: { planImage: { not: null } },
    select: { id: true, planImage: true },
  });
  for (const floor of floors) {
    if (!floor.planImage) continue;
    const hasLegacyPath = /[/\\]/.test(floor.planImage);
    const relativeSource = floor.planImage.replace(/^[/\\]*storage[/\\]*/, "");
    const filename = path.basename(relativeSource);
    const destination = path.join(STORAGE_ROOT, "floor-plans", String(floor.id), filename);
    const source = hasLegacyPath
      ? path.join(SOURCE_ROOT, ...relativeSource.split(/[\\/]/))
      : destination;
    await copyVerified(
      source,
      destination
    );
    if (APPLY && floor.planImage !== filename) {
      await prisma.floor.update({ where: { id: floor.id }, data: { planImage: filename } });
    }
  }

  const totalBytes = manifest.reduce((sum, item) => sum + item.bytes, 0);
  if (APPLY) {
    await fs.mkdir(STORAGE_ROOT, { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(STORAGE_ROOT, "migration-manifest.json"),
      JSON.stringify(manifest, null, 2),
      { mode: 0o600 }
    );
  }
  console.log(`${APPLY ? "Migrated" : "Would migrate"} ${manifest.length} files (${totalBytes} bytes)`);
  console.log(`Private storage: ${STORAGE_ROOT}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
