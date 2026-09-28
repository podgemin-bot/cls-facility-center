import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deleteRoomPhotoFile,
  listRoomPhotos,
  MAX_PHOTO_BYTES,
  PrivateImageError,
  readRoomPhoto,
  saveRoomPhoto,
} from "./private-images";

const ROOT = path.join(process.env.TEMP ?? process.cwd(), "opencode", `cls-images-test-${process.pid}`);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.from("RIFF\0\0\0\0WEBP", "binary");

beforeAll(() => {
  process.env.PRIVATE_STORAGE_ROOT = ROOT;
});

afterAll(async () => {
  await fs.rm(ROOT, { recursive: true, force: true });
});

describe("private image storage", () => {
  it.each([
    ["photo.jpg", "image/jpeg", JPEG, ".jpg"],
    ["photo.png", "image/png", PNG, ".png"],
    ["photo.webp", "image/webp", WEBP, ".webp"],
  ])("saves, lists and reads %s", async (name, type, bytes, extension) => {
    const roomId = Math.floor(Math.random() * 100_000) + 1;
    const filename = await saveRoomPhoto(
      roomId,
      new File([Uint8Array.from(bytes)], name, { type })
    );

    expect(filename).toMatch(new RegExp(`\\${extension}$`));
    expect(await listRoomPhotos(roomId)).toEqual([
      { name: filename, url: `/api/rooms/${roomId}/photos/${filename}` },
    ]);
    expect((await readRoomPhoto(roomId, filename)).buffer).toEqual(bytes);

    await deleteRoomPhotoFile(roomId, filename);
    expect(await listRoomPhotos(roomId)).toEqual([]);
  });

  it("rejects extension, MIME and signature mismatches", async () => {
    await expect(
      saveRoomPhoto(1, new File([Uint8Array.from(PNG)], "wrong.jpg", { type: "image/jpeg" }))
    ).rejects.toMatchObject({ code: "invalid-type" } satisfies Partial<PrivateImageError>);
    await expect(
      saveRoomPhoto(1, new File([Uint8Array.from(JPEG)], "wrong.jpg", { type: "image/png" }))
    ).rejects.toMatchObject({ code: "invalid-type" } satisfies Partial<PrivateImageError>);
  });

  it("rejects empty and oversized files", async () => {
    await expect(
      saveRoomPhoto(1, new File([], "empty.jpg", { type: "image/jpeg" }))
    ).rejects.toMatchObject({ code: "invalid-input" } satisfies Partial<PrivateImageError>);
    await expect(
      saveRoomPhoto(
        1,
        new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "large.jpg", { type: "image/jpeg" })
      )
    ).rejects.toMatchObject({ code: "too-large" } satisfies Partial<PrivateImageError>);
  });
});
