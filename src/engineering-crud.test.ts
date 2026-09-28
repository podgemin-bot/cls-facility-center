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
  createAsset,
  createCertificate,
  deleteAsset,
  deleteCertificate,
  resolveNextAssetCode,
  updateAsset,
  updateCertificate,
  type AssetInput,
  type CertInput,
} from "./app/(front)/engineering/actions";

const ADMIN_ID = "__eng_admin__";
const EDITOR_ID = "__eng_editor__";
const VIEWER_ID = "__eng_viewer__";
const SITE_CODE = "TEST1";
const ASSET_PREFIXES = ["PWR-TEST1-", "COOL-TEST1-"];
const CERT_PREFIX = "TEST-CERT-";

let siteId = 0;
let buildingId = 0;
let floorId = 0;
let roomId = 0;

function powerInput(over: Partial<AssetInput> = {}): AssetInput {
  return {
    category: "POWER",
    name: "เครื่องสำรองไฟ UPS",
    brand: "Eaton",
    model: "93PM",
    status: "Active",
    note: "ติดตั้ง 2566",
    floorId: String(floorId),
    roomId: String(roomId),
    specType: "Power System",
    capacity: "2000kVA",
    load: "1200kW",
    btu: "",
    btuTotal: "",
    unitsTotal: "",
    unitsReady: "",
    unitsDown: "",
    efficiencyPct: "",
    ...over,
  };
}

function certInput(over: Partial<CertInput> = {}): CertInput {
  return {
    code: `${CERT_PREFIX}A`,
    name: "ใบรับรองทดสอบ",
    scope: "STATION",
    siteId: String(siteId),
    issuer: "กองทดสอบ",
    certNo: "TC-001",
    issuedAt: "2025-01-01",
    expiresAt: "2027-01-01",
    detail: "",
    buildingCode: "",
    roomCode: "",
    ...over,
  };
}

beforeAll(async () => {
  await prisma.asset.deleteMany({ where: { code: { startsWith: ASSET_PREFIXES[0] } } });
  await prisma.asset.deleteMany({ where: { code: { startsWith: ASSET_PREFIXES[1] } } });
  await prisma.certificate.deleteMany({ where: { code: { startsWith: CERT_PREFIX } } });

  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: { role: "ADMIN" },
    create: { id: ADMIN_ID, name: "Eng Admin", email: "eng-admin@test.local", role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { id: EDITOR_ID },
    update: { role: "EDITOR" },
    create: { id: EDITOR_ID, name: "Eng Editor", email: "eng-editor@test.local", role: "EDITOR" },
  });
  await prisma.user.upsert({
    where: { id: VIEWER_ID },
    update: { role: "VIEWER" },
    create: { id: VIEWER_ID, name: "Eng Viewer", email: "eng-viewer@test.local", role: "VIEWER" },
  });

  const site = await prisma.site.create({
    data: { code: SITE_CODE, name: "สถานีทดสอบ", province: "ระยอง" },
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
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { code: { startsWith: ASSET_PREFIXES[0] } } });
  await prisma.asset.deleteMany({ where: { code: { startsWith: ASSET_PREFIXES[1] } } });
  await prisma.certificate.deleteMany({ where: { code: { startsWith: CERT_PREFIX } } });
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

describe("engineering asset/cert server actions (real DB, auth mocked)", () => {
  it("resolveNextAssetCode returns the next sequential code", async () => {
    expect(await resolveNextAssetCode("POWER", SITE_CODE)).toBe("PWR-TEST1-001");
    expect(await resolveNextAssetCode("COOLING", SITE_CODE)).toBe("COOL-TEST1-001");
  });

  it("resolveNextAssetCode is null when unauthenticated or without site", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect(await resolveNextAssetCode("POWER", SITE_CODE)).toBeNull();
    expect(await resolveNextAssetCode("POWER", "")).toBeNull();
  });

  it("createAsset creates a POWER asset with the generated code", async () => {
    const res = await createAsset(powerInput());
    expect(res.ok).toBe(true);

    const row = await prisma.asset.findUnique({ where: { code: "PWR-TEST1-001" } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe("เครื่องสำรองไฟ UPS");
    expect(row?.floorId).toBe(floorId);
    expect(row?.roomId).toBe(roomId);
    expect(row?.specs).toMatchObject({ capacity: "2000kVA", load: "1200kW" });
  });

  it("createAsset creates a COOLING asset with cooling specs", async () => {
    const res = await createAsset(powerInput({ category: "COOLING", name: "เครื่องปรับอากาศ CRAC", specType: "Cooling", btu: "242,800 BTU x2", btuTotal: "485600", unitsTotal: "2", unitsReady: "1", unitsDown: "1", efficiencyPct: "50" }));
    expect(res.ok).toBe(true);

    const row = await prisma.asset.findUnique({ where: { code: "COOL-TEST1-001" } });
    expect(row?.category).toBe("COOLING");
    expect(row?.specs).toMatchObject({ btuTotal: 485600, unitsReady: 1, efficiencyPct: 50 });
  });

  it("createAsset rejects empty name, bad category, or missing location", async () => {
    expect((await createAsset(powerInput({ name: "  " }))).error).toBe("invalid-input");
    expect((await createAsset(powerInput({ category: "OTHER" as never }))).error).toBe("invalid-input");
    expect((await createAsset(powerInput({ floorId: "", roomId: "" }))).error).toBe("invalid-input");
  });

  it("createAsset blocks unauthorized and non-editor roles", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await createAsset(powerInput({ name: "X1" }))).error).toBe("unauthorized");

    mocks.getSession.mockResolvedValueOnce({ user: { id: VIEWER_ID } });
    expect((await createAsset(powerInput({ name: "X2" }))).error).toBe("forbidden");
  });

  it("updateAsset renames the asset", async () => {
    await prisma.asset.deleteMany({ where: { code: "PWR-TEST1-001" } });
    await createAsset(powerInput({ name: "เครื่องเดิม" }));
    const a = await prisma.asset.findUniqueOrThrow({ where: { code: "PWR-TEST1-001" } });

    const res = await updateAsset(a.id, powerInput({ name: "เครื่องใหม่" }));
    expect(res.ok).toBe(true);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).name).toBe("เครื่องใหม่");

    await prisma.asset.delete({ where: { id: a.id } });
  });

  it("updateAsset returns not-found and invalid-input guards", async () => {
    expect((await updateAsset(99999999, powerInput())).error).toBe("not-found");
    expect((await updateAsset(0, powerInput())).error).toBe("invalid-input");
    expect((await updateAsset(1, powerInput({ name: "" }))).error).toBe("invalid-input");
  });

  it("deleteAsset removes the asset and returns not-found for missing", async () => {
    await prisma.asset.deleteMany({ where: { code: "PWR-TEST1-001" } });
    await createAsset(powerInput({ name: "ลบทิ้ง" }));
    const a = await prisma.asset.findUniqueOrThrow({ where: { code: "PWR-TEST1-001" } });

    expect((await deleteAsset(a.id)).ok).toBe(true);
    expect(await prisma.asset.findUnique({ where: { id: a.id } })).toBeNull();
    expect((await deleteAsset(a.id)).error).toBe("not-found");
    expect((await deleteAsset(0)).error).toBe("invalid-input");
  });

  it("createCertificate creates a STATION-scoped cert", async () => {
    const res = await createCertificate(certInput());
    expect(res.ok).toBe(true);

    const row = await prisma.certificate.findUnique({ where: { code: `${CERT_PREFIX}A` } });
    expect(row?.name).toBe("ใบรับรองทดสอบ");
    expect(row?.siteId).toBe(siteId);
  });

  it("createCertificate rejects duplicates and invalid input", async () => {
    expect((await createCertificate(certInput())).error).toBe("duplicate-code");
    expect((await createCertificate(certInput({ code: "  " }))).error).toBe("invalid-input");
    expect((await createCertificate(certInput({ name: "" }))).error).toBe("invalid-input");
    expect((await createCertificate(certInput({ scope: "PLANET" }))).error).toBe("invalid-input");
    expect((await createCertificate(certInput({ siteId: "" }))).error).toBe("invalid-input");
  });

  it("createCertificate blocks non-editor roles", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: VIEWER_ID } });
    expect((await createCertificate(certInput({ code: `${CERT_PREFIX}Z` }))).error).toBe("forbidden");
  });

  it("updateCertificate renames and returns duplicate-code when changing to an existing code", async () => {
    await createCertificate(certInput({ code: `${CERT_PREFIX}C`, name: "ใบรับรอง C" }));
    const a = await prisma.certificate.findUniqueOrThrow({ where: { code: `${CERT_PREFIX}A` } });

    const res = await updateCertificate(a.id, certInput({ name: "ใบรับรองใหม่" }));
    expect(res.ok).toBe(true);
    expect((await prisma.certificate.findUniqueOrThrow({ where: { id: a.id } })).name).toBe("ใบรับรองใหม่");

    const dup = await updateCertificate(a.id, certInput({ code: `${CERT_PREFIX}C` }));
    expect(dup.error).toBe("duplicate-code");
  });

  it("deleteCertificate removes the cert and returns not-found", async () => {
    const a = await prisma.certificate.findUniqueOrThrow({ where: { code: `${CERT_PREFIX}A` } });
    expect((await deleteCertificate(a.id)).ok).toBe(true);
    expect(await prisma.certificate.findUnique({ where: { id: a.id } })).toBeNull();
    expect((await deleteCertificate(a.id)).error).toBe("not-found");
  });
});