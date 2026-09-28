import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

import prisma from "@/lib/prisma";
import {
  createBuilding,
  createFloor,
  createRoom,
  createSite,
  deleteBuilding,
  deleteFloor,
  deleteRoom,
  deleteSite,
  updateBuilding,
  updateFloor,
  updateRoom,
  updateSite,
  type BuildingInput,
  type FloorInput,
  type RoomInput,
  type SiteInput,
} from "./app/(front)/locations/actions";

const ADMIN_ID = "__loc_admin__";
const EDITOR_ID = "__loc_editor__";
const VIEWER_ID = "__loc_viewer__";

function siteInput(code: string, over: Partial<SiteInput> = {}): SiteInput {
  return {
    code,
    name: "สถานีทดสอบ",
    province: "ระยอง",
    lat: "12.3456",
    lng: "101.2345",
    ...over,
  };
}

function buildingInput(siteId: number, over: Partial<BuildingInput> = {}): BuildingInput {
  return { siteId, name: "อาคารหลัก", ...over };
}

function floorInput(buildingId: number, over: Partial<FloorInput> = {}): FloorInput {
  return { buildingId, level: "1", label: "ชั้น 1", ...over };
}

function roomInput(floorId: number, over: Partial<RoomInput> = {}): RoomInput {
  return {
    floorId,
    no: "1",
    name: "ห้องเครื่อง",
    status: "VACANT",
    areaSqm: "120",
    ceilingHeightM: "3.2",
    raisedFloorCm: "60",
    floorLoadKgm2: "800",
    tenant: "",
    ...over,
  };
}

async function seed(code: string) {
  const site = await prisma.site.create({
    data: { code, name: "สถานีทดสอบ", province: "ระยอง" },
  });
  const building = await prisma.building.create({
    data: { siteId: site.id, name: "อาคารหลัก", code: `${code}-B01` },
  });
  const floor = await prisma.floor.create({
    data: { buildingId: building.id, level: 1, label: "ชั้น 1", code: `${code}-B01-F1` },
  });
  const room = await prisma.room.create({
    data: { floorId: floor.id, no: 1, name: "ห้องเครื่อง", code: `${code}-B01-F1-R01`, status: "VACANT" },
  });
  return { site, building, floor, room };
}

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: { role: "ADMIN" },
    create: { id: ADMIN_ID, name: "Loc Admin", email: "loc-admin@test.local", role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { id: EDITOR_ID },
    update: { role: "EDITOR" },
    create: { id: EDITOR_ID, name: "Loc Editor", email: "loc-editor@test.local", role: "EDITOR" },
  });
  await prisma.user.upsert({
    where: { id: VIEWER_ID },
    update: { role: "VIEWER" },
    create: { id: VIEWER_ID, name: "Loc Viewer", email: "loc-viewer@test.local", role: "VIEWER" },
  });
});

afterAll(async () => {
  const sites = await prisma.site.findMany({ where: { code: { startsWith: "LOC" } }, select: { id: true } });
  const siteIds = sites.map((s) => s.id);
  if (siteIds.length) {
    const buildings = await prisma.building.findMany({ where: { siteId: { in: siteIds } }, select: { id: true } });
    const buildingIds = buildings.map((b) => b.id);
    if (buildingIds.length) {
      const floors = await prisma.floor.findMany({ where: { buildingId: { in: buildingIds } }, select: { id: true } });
      const floorIds = floors.map((f) => f.id);
      if (floorIds.length) {
        const rooms = await prisma.room.findMany({ where: { floorId: { in: floorIds } }, select: { id: true } });
        const roomIds = rooms.map((r) => r.id);
        await prisma.asset.deleteMany({ where: { roomId: { in: roomIds } } });
        await prisma.photoPoint.deleteMany({ where: { roomId: { in: roomIds } } });
        await prisma.roomSecurity.deleteMany({ where: { roomId: { in: roomIds } } });
        await prisma.room.deleteMany({ where: { floorId: { in: floorIds } } });
      }
      await prisma.floor.deleteMany({ where: { buildingId: { in: buildingIds } } });
    }
    await prisma.building.deleteMany({ where: { siteId: { in: siteIds } } });
    await prisma.certificate.deleteMany({ where: { siteId: { in: siteIds } } });
    await prisma.site.deleteMany({ where: { id: { in: siteIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, EDITOR_ID, VIEWER_ID] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({ user: { id: ADMIN_ID } });
});

describe("locations server actions (real DB, auth mocked)", () => {
  it("createSite creates a site, uppercasing the code", async () => {
    const res = await createSite(siteInput("locx"));
    expect(res.ok).toBe(true);

    const row = await prisma.site.findUniqueOrThrow({ where: { code: "LOCX" } });
    expect(row.name).toBe("สถานีทดสอบ");
    expect(row.lat).toBeCloseTo(12.3456, 4);
  });

  it("createSite rejects invalid, empty, and duplicate codes", async () => {
    expect((await createSite(siteInput("LOC!!"))).error).toBe("invalid-site-code");
    expect((await createSite(siteInput("  "))).error).toBe("invalid-site-code");
    expect((await createSite(siteInput("LOC1", { name: "  " }))).error).toBe("invalid-input");
    expect((await createSite(siteInput("LOC1", { province: "" }))).error).toBe("invalid-input");

    expect((await createSite(siteInput("LOC1"))).ok).toBe(true);
    expect((await createSite(siteInput("LOC1"))).error).toBe("duplicate-code");
  });

  it("updateSite renames and returns not-found", async () => {
    const { site } = await seed("LOC2");
    const res = await updateSite(site.id, siteInput("LOC2", { name: "สถานีใหม่", province: "ชลบุรี" }));
    expect(res.ok).toBe(true);

    const row = await prisma.site.findUniqueOrThrow({ where: { id: site.id } });
    expect(row.name).toBe("สถานีใหม่");
    expect(row.province).toBe("ชลบุรี");

    expect((await updateSite(99999999, siteInput("LOC2"))).error).toBe("not-found");
    expect((await updateSite(site.id, siteInput("LOC2", { name: "  " }))).error).toBe("invalid-input");
  });

  it("createBuilding generates sequential codes B01 then B02", async () => {
    const { site } = await seed("LOC3");

    expect((await createBuilding(buildingInput(site.id))).ok).toBe(true);
    const b2 = await prisma.building.findUniqueOrThrow({ where: { code: "LOC3-B02" } });
    expect(b2.name).toBe("อาคารหลัก");

    expect((await createBuilding(buildingInput(99999999))).error).toBe("not-found");
    expect((await createBuilding(buildingInput(site.id, { name: " " }))).error).toBe("invalid-input");
  });

  it("updateBuilding renames and guards not-found", async () => {
    const { building } = await seed("LOC4");
    expect((await updateBuilding(building.id, "อาคารใหม่")).ok).toBe(true);
    expect((await prisma.building.findUniqueOrThrow({ where: { id: building.id } })).name).toBe("อาคารใหม่");

    expect((await updateBuilding(99999999, "X")).error).toBe("not-found");
    expect((await updateBuilding(building.id, "  ")).error).toBe("invalid-input");
  });

  it("createFloor numbers levels, rejects duplicate levels", async () => {
    const { building } = await seed("LOC5");
    expect((await createFloor(floorInput(building.id, { level: "2", label: "ชั้น 2" }))).ok).toBe(true);
    expect((await createFloor(floorInput(building.id, { level: "2" }))).error).toBe("duplicate-level");
    expect((await createFloor(floorInput(building.id, { level: "abc" }))).error).toBe("invalid-input");
    expect((await createFloor(floorInput(99999999))).error).toBe("not-found");
  });

  it("updateFloor renames and regenerates the code when level changes", async () => {
    const { floor } = await seed("LOC6");
    const res = await updateFloor(floor.id, floorInput(floor.buildingId, { level: "5", label: "ชั้น 5" }));
    expect(res.ok).toBe(true);

    const row = await prisma.floor.findUniqueOrThrow({ where: { id: floor.id } });
    expect(row.level).toBe(5);
    expect(row.code).toBe("LOC6-B01-F05");

    expect((await updateFloor(99999999, floorInput(floor.buildingId))).error).toBe("not-found");
  });

  it("createRoom generates {floor}-R{no} codes with padded numbers", async () => {
    const { floor } = await seed("LOC7");
    expect((await createRoom(roomInput(floor.id, { no: "3", name: "ห้องเซิร์ฟเวอร์", status: "MAINTENANCE", tenant: " บริษัท ก. " }))).ok).toBe(true);

    const row = await prisma.room.findUniqueOrThrow({ where: { code: "LOC7-B01-F1-R03" } });
    expect(row.name).toBe("ห้องเซิร์ฟเวอร์");
    expect(row.status).toBe("MAINTENANCE");
    expect(row.tenant).toBe("บริษัท ก.");
    expect(row.areaSqm).toBe(120);

    expect((await createRoom(roomInput(floor.id, { status: "BOGUS" }))).error).toBe("invalid-input");
    expect((await createRoom(roomInput(floor.id, { no: "x" }))).error).toBe("invalid-input");
  });

  it("updateRoom updates fields and regenerates the code", async () => {
    const { room } = await seed("LOC8");
    const res = await updateRoom(room.id, roomInput(room.floorId, { no: "9", name: "ห้องใหม่", status: "RESERVED" }));
    expect(res.ok).toBe(true);

    const row = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(row.code).toBe("LOC8-B01-F1-R09");
    expect(row.status).toBe("RESERVED");
    expect(row.name).toBe("ห้องใหม่");

    expect((await updateRoom(99999999, roomInput(room.floorId))).error).toBe("not-found");
  });

  it("deleteRoom removes the room and returns not-found", async () => {
    const { room } = await seed("LOC9");
    expect((await deleteRoom(room.id)).ok).toBe(true);
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
    expect((await deleteRoom(room.id)).error).toBe("not-found");
  });

  it("deleteFloor cascades its rooms", async () => {
    const { floor } = await seed("LOCA");
    expect((await deleteFloor(floor.id)).ok).toBe(true);
    expect(await prisma.room.findMany({ where: { floorId: floor.id } })).toEqual([]);
    expect((await deleteFloor(floor.id)).error).toBe("not-found");
  });

  it("deleteBuilding cascades floors and rooms", async () => {
    const { building, floor } = await seed("LOCB");
    expect((await deleteBuilding(building.id)).ok).toBe(true);
    expect(await prisma.floor.findUnique({ where: { id: floor.id } })).toBeNull();
    expect((await deleteBuilding(building.id)).error).toBe("not-found");
  });

  it("deleteSite cascades buildings, floors, rooms, and site-scoped certs", async () => {
    const { site, floor } = await seed("LOCC");
    await prisma.certificate.create({
      data: { code: "LOCC-CERT-01", name: "ใบรับรองสถานี", scope: "STATION", siteId: site.id },
    });

    expect((await deleteSite(site.id)).ok).toBe(true);
    expect(await prisma.site.findUnique({ where: { id: site.id } })).toBeNull();
    expect(await prisma.room.findMany({ where: { floorId: floor.id } })).toEqual([]);
    expect(await prisma.certificate.findMany({ where: { siteId: site.id } })).toEqual([]);
    expect((await deleteSite(site.id)).error).toBe("not-found");
  });

  it("blocks unauthorized and non-editor roles", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await createSite(siteInput("LOCD"))).error).toBe("unauthorized");

    mocks.getSession.mockResolvedValueOnce({ user: { id: VIEWER_ID } });
    expect((await createSite(siteInput("LOCD"))).error).toBe("forbidden");

    mocks.getSession.mockResolvedValueOnce({ user: { id: VIEWER_ID } });
    expect((await deleteSite(99999999)).error).toBe("forbidden");
  });
});