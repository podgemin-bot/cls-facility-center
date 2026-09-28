import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  roomFindUnique: vi.fn(),
  floorFindUnique: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/prisma", () => ({
  default: {
    room: { findUnique: mocks.roomFindUnique },
    floor: { findUnique: mocks.floorFindUnique },
  },
}));

import { GET as getRoomPhoto } from "@/app/api/rooms/[roomId]/photos/[filename]/route";
import { GET as getFloorPlan } from "@/app/api/floors/[floorId]/plan/[filename]/route";
import { saveRoomPhoto } from "@/lib/private-images";

const ROOT = path.join(process.env.TEMP ?? process.cwd(), "opencode", `cls-routes-test-${process.pid}`);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeAll(() => {
  process.env.PRIVATE_STORAGE_ROOT = ROOT;
});

afterAll(async () => {
  await fs.rm(ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.roomFindUnique.mockReset();
  mocks.floorFindUnique.mockReset();
});

describe("private image routes", () => {
  it("rejects anonymous room photo reads", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await getRoomPhoto(
      new Request("http://localhost/api/rooms/1/photos/photo.jpg"),
      { params: Promise.resolve({ roomId: "1", filename: "photo.jpg" }) }
    );
    expect(response.status).toBe(401);
    expect(mocks.roomFindUnique).not.toHaveBeenCalled();
  });

  it("serves a verified room photo only to an authenticated user", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.roomFindUnique.mockResolvedValue({ id: 10 });
    const filename = await saveRoomPhoto(
      10,
      new File([Uint8Array.from(JPEG)], "photo.jpg", { type: "image/jpeg" })
    );

    const response = await getRoomPhoto(
      new Request(`http://localhost/api/rooms/10/photos/${filename}`),
      { params: Promise.resolve({ roomId: "10", filename }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(JPEG);
  });

  it("serves a verified floor plan and hides unknown names", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "viewer" } });
    mocks.floorFindUnique.mockResolvedValue({ planImage: "/storage/plans/plan.png" });
    const dir = path.join(ROOT, "floor-plans", "20");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "plan.png"), PNG);

    const ok = await getFloorPlan(
      new Request("http://localhost/api/floors/20/plan/plan.png"),
      { params: Promise.resolve({ floorId: "20", filename: "plan.png" }) }
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");

    const missing = await getFloorPlan(
      new Request("http://localhost/api/floors/20/plan/other.png"),
      { params: Promise.resolve({ floorId: "20", filename: "other.png" }) }
    );
    expect(missing.status).toBe(404);
  });
});
