// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: async () => {},
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("@/lib/prisma", () => ({
  default: { site: { findMany: mocks.findMany }, room: { groupBy: mocks.groupBy } },
}));
vi.mock("@/lib/auth-session", () => ({
  requireSession: vi.fn(async () => ({ user: { id: "test-user" } })),
}));

import DashboardPage from "./page";

const sitePKB = {
  id: 1,
  code: "PKB",
  name: "สถานีปากบารา",
  province: "สตูล",
  lat: 6.5,
  lng: 100,
  buildings: [
    {
      id: 10,
      code: "PKB-B01",
      name: "อาคารปากบารา",
      floors: [
        { id: 100, code: "PKB-B01-F01", level: 1, label: "ชั้น 1", _count: { rooms: 2 } },
        { id: 101, code: "PKB-B01-F02", level: 2, label: "ชั้น 2", _count: { rooms: 3 } },
      ],
    },
  ],
};

const STATUS_LABELS = ["ว่าง", "มีผู้ใช้งาน", "ซ่อมบำรุง", "จอง"];

async function renderDashboard() {
  const element = await DashboardPage();
  render(element);
}

function summaryText(): string {
  const [p] = screen.getAllByText(
    (_, el) => el?.tagName === "P" && /รวมทุกสถานี/.test(el?.textContent ?? "")
  );
  return p.textContent ?? "";
}

describe("DashboardPage (async RSC)", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
    mocks.groupBy.mockReset();
  });

  it("shows overview header, site/total-room counts and the full status legend", async () => {
    mocks.findMany.mockResolvedValue([sitePKB]);
    mocks.groupBy.mockResolvedValue([{ status: "OCCUPIED", _count: { _all: 5 } }]);

    await renderDashboard();

    expect(screen.getByRole("heading", { name: "ภาพรวมสถานี" })).toBeInTheDocument();
    expect(summaryText()).toContain("รวมทุกสถานี 1 แห่ง · 5 ห้อง");
    for (const label of STATUS_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders site card with name, province/GPS and a Google Maps link", async () => {
    mocks.findMany.mockResolvedValue([sitePKB]);
    mocks.groupBy.mockResolvedValue([{ status: "OCCUPIED", _count: { _all: 5 } }]);

    await renderDashboard();

    expect(screen.getByText("PKB")).toBeInTheDocument();
    expect(screen.getByText("สถานีปากบารา")).toBeInTheDocument();
    expect(screen.getByText(/จ\.สตูล · GPS 6\.5000, 100\.0000/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "เปิดแผนที่" })).toHaveAttribute(
      "href",
      "https://maps.google.com/?q=6.5,100"
    );
  });

  it("shows per-site stats, floor shortcuts and the all-rooms link into /rooms", async () => {
    mocks.findMany.mockResolvedValue([sitePKB]);
    mocks.groupBy.mockResolvedValue([{ status: "OCCUPIED", _count: { _all: 5 } }]);

    await renderDashboard();

    for (const label of ["อาคาร", "ชั้น", "ห้อง", "ชั้นทั้งหมด"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("link", { name: "ชั้น 1 · 2 ห้อง" })).toHaveAttribute(
      "href",
      "/rooms?floor=PKB-B01-F01"
    );
    expect(screen.getByRole("link", { name: "ชั้น 2 · 3 ห้อง" })).toHaveAttribute(
      "href",
      "/rooms?floor=PKB-B01-F02"
    );
    expect(screen.getByRole("link", { name: /ดูห้องทั้งหมดของPKB/ })).toHaveAttribute(
      "href",
      "/rooms?site=PKB"
    );
  });

  it("queries prisma per-site with a site-scoped where clause and renders status counts", async () => {
    mocks.findMany.mockResolvedValue([sitePKB]);
    mocks.groupBy.mockResolvedValue([{ status: "OCCUPIED", _count: { _all: 5 } }]);

    await renderDashboard();

    expect(mocks.groupBy).toHaveBeenCalledTimes(1);
    expect(mocks.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["status"],
        where: expect.objectContaining({
          floor: expect.objectContaining({ building: expect.objectContaining({ siteId: 1 }) }),
        }),
      })
    );
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });

  it("defaults missing statuses to 0 and tolerates a site without building/floor", async () => {
    const bareSKA = {
      id: 2,
      code: "SKA",
      name: "สถานีสงขลา",
      province: "สงขลา",
      lat: null,
      lng: null,
      buildings: [],
    };
    mocks.findMany.mockResolvedValue([bareSKA]);
    mocks.groupBy.mockResolvedValue([{ status: "OCCUPIED", _count: { _all: 4 } }]);

    await renderDashboard();

    expect(screen.getByText("สถานีสงขลา")).toBeInTheDocument();
    expect(summaryText()).toContain("รวมทุกสถานี 1 แห่ง · 4 ห้อง");
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(3);
  });

  it("renders an empty state when no sites exist (no status query)", async () => {
    mocks.findMany.mockResolvedValue([]);

    await renderDashboard();

    expect(summaryText()).toContain("รวมทุกสถานี 0 แห่ง · 0 ห้อง");
    expect(screen.queryByRole("link", { name: /ดูห้องทั้งหมด/ })).not.toBeInTheDocument();
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });
});
