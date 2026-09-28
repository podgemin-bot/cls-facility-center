import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { RoomPhotoFile } from "@/lib/cls";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

type ImageKind = "jpeg" | "png" | "webp";
type ImageInfo = { kind: ImageKind; mime: string; extension: string };

const IMAGE_BY_EXTENSION: Record<string, ImageInfo> = {
  ".jpg": { kind: "jpeg", mime: "image/jpeg", extension: ".jpg" },
  ".jpeg": { kind: "jpeg", mime: "image/jpeg", extension: ".jpg" },
  ".png": { kind: "png", mime: "image/png", extension: ".png" },
  ".webp": { kind: "webp", mime: "image/webp", extension: ".webp" },
};

export type PrivateImageErrorCode =
  | "invalid-input"
  | "invalid-type"
  | "too-large"
  | "not-found";

export class PrivateImageError extends Error {
  constructor(public readonly code: PrivateImageErrorCode) {
    super(code);
  }
}

export function getPrivateStorageRoot(): string {
  const configured = process.env.PRIVATE_STORAGE_ROOT?.trim();
  const root = path.resolve(
    /* turbopackIgnore: true */ configured || path.join(process.cwd(), ".data")
  );
  const publicRoot = path.resolve(process.cwd(), "public");
  const relativeToPublic = path.relative(publicRoot, root);
  if (!relativeToPublic || (!relativeToPublic.startsWith("..") && !path.isAbsolute(relativeToPublic))) {
    throw new Error("PRIVATE_STORAGE_ROOT must be outside public");
  }
  return root;
}

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

function safeFilename(filename: string): boolean {
  return (
    filename.length > 0 &&
    filename.length <= 220 &&
    filename === path.basename(filename) &&
    !filename.includes("..") &&
    Boolean(IMAGE_BY_EXTENSION[path.extname(filename).toLowerCase()])
  );
}

function roomPhotoDir(roomId: number): string {
  if (!validId(roomId)) throw new PrivateImageError("invalid-input");
  return path.join(getPrivateStorageRoot(), "room-photos", String(roomId));
}

function floorPlanDir(floorId: number): string {
  if (!validId(floorId)) throw new PrivateImageError("invalid-input");
  return path.join(getPrivateStorageRoot(), "floor-plans", String(floorId));
}

function detectImage(buffer: Buffer): ImageInfo | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return IMAGE_BY_EXTENSION[".jpg"];
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return IMAGE_BY_EXTENSION[".png"];
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return IMAGE_BY_EXTENSION[".webp"];
  }
  return null;
}

function validateStoredImage(filename: string, buffer: Buffer): ImageInfo {
  if (!safeFilename(filename)) throw new PrivateImageError("invalid-input");
  const expected = IMAGE_BY_EXTENSION[path.extname(filename).toLowerCase()];
  const detected = detectImage(buffer);
  if (!expected || !detected || expected.kind !== detected.kind) {
    throw new PrivateImageError("invalid-type");
  }
  return detected;
}

export function roomPhotoUrl(roomId: number, filename: string): string {
  if (!validId(roomId) || !safeFilename(filename)) {
    throw new PrivateImageError("invalid-input");
  }
  return `/api/rooms/${roomId}/photos/${encodeURIComponent(filename)}`;
}

export async function listRoomPhotos(roomId: number): Promise<RoomPhotoFile[]> {
  try {
    const entries = await fs.readdir(roomPhotoDir(roomId), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && safeFilename(entry.name))
      .map((entry) => entry.name)
      .sort()
      .map((name) => ({ name, url: roomPhotoUrl(roomId, name) }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function saveRoomPhoto(roomId: number, file: File): Promise<string> {
  if (!validId(roomId) || !file.name || file.size === 0) {
    throw new PrivateImageError("invalid-input");
  }
  if (file.size > MAX_PHOTO_BYTES) throw new PrivateImageError("too-large");

  const expected = IMAGE_BY_EXTENSION[path.extname(file.name).toLowerCase()];
  if (!expected || file.type !== expected.mime) throw new PrivateImageError("invalid-type");

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(buffer);
  if (!detected || detected.kind !== expected.kind) throw new PrivateImageError("invalid-type");

  const rawBase = path.basename(file.name, path.extname(file.name));
  const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 60);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${safeBase || "photo"}-${stamp}-${randomUUID()}${detected.extension}`;
  const dir = roomPhotoDir(roomId);
  const temporary = path.join(dir, `.${filename}.tmp`);
  const destination = path.join(dir, filename);

  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(temporary, buffer, { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, destination);
    return filename;
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readRoomPhoto(roomId: number, filename: string) {
  if (!validId(roomId) || !safeFilename(filename)) {
    throw new PrivateImageError("invalid-input");
  }
  const filePath = path.join(roomPhotoDir(roomId), filename);
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new PrivateImageError("not-found");
    const buffer = await fs.readFile(filePath);
    const info = validateStoredImage(filename, buffer);
    return { buffer, mime: info.mime };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PrivateImageError("not-found");
    }
    throw error;
  }
}

export async function deleteRoomPhotoFile(roomId: number, filename: string): Promise<void> {
  if (!validId(roomId) || !safeFilename(filename)) {
    throw new PrivateImageError("invalid-input");
  }
  try {
    await fs.unlink(path.join(roomPhotoDir(roomId), filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PrivateImageError("not-found");
    }
    throw error;
  }
}

export async function deleteRoomPhotoDirectory(roomId: number): Promise<void> {
  await fs.rm(roomPhotoDir(roomId), { recursive: true, force: true });
}

function floorPlanFilename(planImage: string): string {
  const filename = planImage.split(/[\\/]/).pop() ?? "";
  if (!safeFilename(filename)) throw new PrivateImageError("invalid-input");
  return filename;
}

export function floorPlanUrl(floorId: number, planImage: string | null): string | null {
  if (!planImage) return null;
  const filename = floorPlanFilename(planImage);
  return `/api/floors/${floorId}/plan/${encodeURIComponent(filename)}`;
}

export async function readFloorPlan(floorId: number, planImage: string) {
  const filename = floorPlanFilename(planImage);
  const filePath = path.join(floorPlanDir(floorId), filename);
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new PrivateImageError("not-found");
    const buffer = await fs.readFile(filePath);
    const info = validateStoredImage(filename, buffer);
    return { buffer, mime: info.mime };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PrivateImageError("not-found");
    }
    throw error;
  }
}

export async function deleteFloorPlanDirectory(floorId: number): Promise<void> {
  await fs.rm(floorPlanDir(floorId), { recursive: true, force: true });
}
