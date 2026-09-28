import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

import prisma from "@/lib/prisma";
import { joinAccessControl } from "@/lib/cls";
import {
  deleteRoomPhoto,
  updateRoom,
  updateRoomSecurity,
  uploadRoomPhoto,
  type UpdateRoomInput,
} from "./app/(front)/rooms/actions";

const ADMIN_ID = "__rm_admin__";
const EDITOR_ID = "__rm_editor__";
const VIEWER_ID = "__rm_viewer__";
const SITE_CODE = "TEST2";
const PHOTO_ROOT = path.join(process.env.TEMP ?? process.cwd(), "opencode", `cls-room-test-${process.pid}`);

let siteId = 0;
let buildingId = 0;
let floorId = 0;
let roomId = 0;
let photoDir = "";

function roomInput(over: Partial<UpdateRoomInput> = {}): UpdateRoomInput {
  return {
    id: roomId,
    name: "ห้องเครื่องแอร์",
    status: "OCCUPIED",
    no: "3",
    areaSqm: "12.5",
    ceilingHeightM: "",
    raisedFloorCm: "30",
    floorLoadKgm2: "500",
    tenant: "บริษัท เทเลคอม จำกัด",
    ...over,
  };
}

function fakeFile(name: string, bytes: Buffer, type = "image/jpeg"): File {
  return new File([Uint8Array.from(bytes)], name, { type });
}

beforeAll(async () => {
  process.env.PRIVATE_STORAGE_ROOT = PHOTO_ROOT;
  await prisma.roomSecurity.deleteMany({ where: { room: { floor: { building: { site: { code: SITE_CODE } } } } } });
  await prisma.room.deleteMany({ where: { floor: { building: { site: { code: SITE_CODE } } } } });

  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: { role: "ADMIN" },
    create: { id: ADMIN_ID, name: "Rm Admin", email: "rm-admin@test.local", role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { id: EDITOR_ID },
    update: { role: "EDITOR" },
    create: { id: EDITOR_ID, name: "Rm Editor", email: "rm-editor@test.local", role: "EDITOR" },
  });
  await prisma.user.upsert({
    where: { id: VIEWER_ID },
    update: { role: "VIEWER" },
    create: { id: VIEWER_ID, name: "Rm Viewer", email: "rm-viewer@test.local", role: "VIEWER" },
  });

  const site = await prisma.site.create({
    data: { code: SITE_CODE, name: "สถานีทดสอบ 2", province: "ระยอง" },
  });
  siteId = site.id;
  const building = await prisma.building.create({
    data: { siteId, name: "อาคารทดสอบ", code: `${SITE_CODE}-B01` },
  });
  buildingId = building.id;
  const floor = await prisma.floor.create({
    data: { buildingId, level: 1, label: "ชั้น 1", code: `${SITE_CODE}-B01-F1` },
  });
  floorId = floor.id;
  const room = await prisma.room.create({
    data: { floorId, no: 1, name: "ห้องเครื่อง", code: `${SITE_CODE}-B01-F1-R01`, status: "VACANT" },
  });
  roomId = room.id;

  photoDir = path.join(PHOTO_ROOT, "room-photos", String(roomId));
});

afterAll(async () => {
  await fs.rm(PHOTO_ROOT, { recursive: true, force: true });
  await prisma.roomSecurity.deleteMany({ where: { roomId } });
  await prisma.room.deleteMany({ where: { floorId } });
  await prisma.floor.deleteMany({ where: { buildingId } });
  await prisma.building.deleteMany({ where: { siteId } });
  await prisma.site.deleteMany({ where: { id: siteId } });
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, EDITOR_ID, VIEWER_ID] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({ user: { id: ADMIN_ID } });
});

describe("rooms server actions (real DB + real fs, auth mocked)", () => {
  it("updateRoom edits name/status/numbers and trims tenant", async () => {
    const res = await updateRoom(roomInput());
    expect(res.ok).toBe(true);

    const row = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(row.name).toBe("ห้องเครื่องแอร์");
    expect(row.status).toBe("OCCUPIED");
    expect(row.no).toBe(3);
    expect(row.areaSqm).toBe(12.5);
    expect(row.ceilingHeightM).toBeNull();
    expect(row.raisedFloorCm).toBe(30);
    expect(row.floorLoadKgm2).toBe(500);
    expect(row.tenant).toBe("บริษัท เทเลคอม จำกัด");
  });

  it("updateRoom rejects empty name and invalid status", async () => {
    expect((await updateRoom(roomInput({ name: "  " }))).error).toBe("invalid-input");
    expect((await updateRoom(roomInput({ status: "OPEN" }))).error).toBe("invalid-input");
  });

  it("updateRoom returns not-found for missing room", async () => {
    expect((await updateRoom(roomInput({ id: 99999999 }))).error).toBe("not-found");
  });

  it("updateRoom blocks unauthorized and non-editor roles", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await updateRoom(roomInput())).error).toBe("unauthorized");

    mocks.getSession.mockResolvedValueOnce({ user: { id: VIEWER_ID } });
    expect((await updateRoom(roomInput())).error).toBe("forbidden");
  });

  it("updateRoomSecurity upserts security data for the room", async () => {
    const res = await updateRoomSecurity({
      roomId,
      cctvCount: "12",
      accessControl: ["RFID Proximity Card", "PIN Code"],
      fireSuppression: "FM-200 (HFC-227ea)",
      vesda: "VESDA",
    });
    expect(res.ok).toBe(true);

    const row = await prisma.roomSecurity.findUniqueOrThrow({ where: { roomId } });
    expect(row.cctvCount).toBe(12);
    expect(row.accessControl).toBe(
      joinAccessControl(["RFID Proximity Card", "PIN Code"])
    );
    expect(row.fireSuppression).toBe("FM-200 (HFC-227ea)");
    expect(row.vesda).toBe("VESDA");
  });

  it("updateRoomSecurity updates existing row and normalizes invalid options to null", async () => {
    const res = await updateRoomSecurity({
      roomId,
      cctvCount: "not-a-number",
      accessControl: ["BOGUS", "", "RFID Proximity Card"],
      fireSuppression: "UNKNOWN AGENT",
      vesda: "?",
    });
    expect(res.ok).toBe(true);

    // "PIN Code" absent + "BOGUS" filtered -> only valid choices survive
    const row = await prisma.roomSecurity.findUniqueOrThrow({ where: { roomId } });
    expect(row.cctvCount).toBeNull();
    expect(row.accessControl).toBe(joinAccessControl(["RFID Proximity Card"]));
    expect(row.fireSuppression).toBeNull();
    expect(row.vesda).toBeNull();
  });

  it("updateRoomSecurity returns not-found for missing room", async () => {
    expect((await updateRoomSecurity({ roomId: 99999999, cctvCount: "1", accessControl: [], fireSuppression: "", vesda: "" })).error).toBe("not-found");
  });

  it("uploadRoomPhoto writes the file and deleteRoomPhoto removes it", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const res = await uploadRoomPhoto(roomId, fakeFile("test-ภาพ.jpg", jpeg));
    expect(res.ok).toBe(true);

    const files = await fs.readdir(photoDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("test-");
    expect(files[0]).toMatch(/\.jpg$/);

    expect((await deleteRoomPhoto(roomId, files[0])).ok).toBe(true);
    expect(await fs.readdir(photoDir)).toHaveLength(0);
  });

  it("uploadRoomPhoto rejects bad extensions, signatures, oversized files, invalid rooms and anonymous", async () => {
    expect((await uploadRoomPhoto(roomId, fakeFile("movie.mp4", Buffer.from("x"), "video/mp4"))).error).toBe("invalid-type");
    expect((await uploadRoomPhoto(roomId, fakeFile("fake.jpg", Buffer.from("fakejpg")))).error).toBe("invalid-type");
    expect((await uploadRoomPhoto(roomId, fakeFile("big.png", Buffer.alloc(10 * 1024 * 1024 + 1), "image/png"))).error).toBe("too-large");
    expect((await uploadRoomPhoto(0, fakeFile("x.jpg", Buffer.from([0xff, 0xd8, 0xff])))).error).toBe("invalid-input");
    expect((await uploadRoomPhoto(99999999, fakeFile("x.jpg", Buffer.from([0xff, 0xd8, 0xff])))).error).toBe("not-found");

    mocks.getSession.mockResolvedValueOnce(null);
    expect((await uploadRoomPhoto(roomId, fakeFile("x.jpg", Buffer.from([0xff, 0xd8, 0xff])))).error).toBe("unauthorized");

    mocks.getSession.mockResolvedValueOnce({ user: { id: VIEWER_ID } });
    expect((await uploadRoomPhoto(roomId, fakeFile("x.jpg", Buffer.from([0xff, 0xd8, 0xff])))).error).toBe("forbidden");
  });

  it("deleteRoomPhoto returns invalid-input for unsafe names and not-found when missing", async () => {
    expect((await deleteRoomPhoto(roomId, "../x.jpg")).error).toBe("invalid-input");
    expect((await deleteRoomPhoto(roomId, "not-here.jpg")).error).toBe("not-found");
  });
});
