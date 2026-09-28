// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  EngHierarchySite,
  SerializedCertificate,
  SerializedCoolingAsset,
  SerializedPowerAsset,
  SerializedRoomSecurityRow,
} from "@/lib/cls";

const mocks = vi.hoisted(() => ({
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  deleteAsset: vi.fn(),
  createCertificate: vi.fn(),
  updateCertificate: vi.fn(),
  deleteCertificate: vi.fn(),
  resolveNextAssetCode: vi.fn(),
  updateRoomSecurity: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("./actions", () => ({
  createAsset: mocks.createAsset,
  updateAsset: mocks.updateAsset,
  deleteAsset: mocks.deleteAsset,
  createCertificate: mocks.createCertificate,
  updateCertificate: mocks.updateCertificate,
  deleteCertificate: mocks.deleteCertificate,
  resolveNextAssetCode: mocks.resolveNextAssetCode,
}));
vi.mock("../rooms/actions", () => ({
  updateRoomSecurity: mocks.updateRoomSecurity,
}));

import EngineeringClient from "./engineering-client";

const POWER: SerializedPowerAsset[] = [
  {
    id: 11,
    code: "PWR-S1-001",
    legacyCode: null,
    name: "UPS A",
    brand: "Eaton",
    model: "93PM",
    status: "Active",
    note: "ติดตั้ง 2566",
    specType: "Power System",
    capacity: "200kVA",
    load: "120kW",
    floorId: null,
    roomId: null,
    siteCode: "S1",
    buildingCode: null,
    floorCode: null,
    floorLabel: null,
    roomCode: null,
  },
  {
    id: 12,
    code: "PWR-S2-001",
    legacyCode: null,
    name: "UPS B",
    brand: null,
    model: null,
    status: "Maintenance",
    note: null,
    specType: "Power System",
    capacity: "100kVA",
    load: "60kW",
    floorId: null,
    roomId: null,
    siteCode: "S2",
    buildingCode: null,
    floorCode: null,
    floorLabel: null,
    roomCode: null,
  },
];

const COOLING: SerializedCoolingAsset[] = [
  {
    id: 21,
    code: "COOL-S1-001",
    legacyCode: null,
    name: "CRAC 1",
    model: "D20",
    specType: "Cooling",
    note: null,
    btu: "242,800 BTU x2",
    btuTotal: 485600,
    unitsTotal: 2,
    unitsReady: 1,
    unitsDown: 1,
    efficiencyPct: 88,
    roomId: null,
    siteCode: "S1",
    roomCode: null,
  },
  {
    id: 22,
    code: "COOL-S1-002",
    legacyCode: null,
    name: "CRAC 2",
    model: null,
    specType: "Cooling",
    note: null,
    btu: null,
    btuTotal: 240000,
    unitsTotal: 2,
    unitsReady: 2,
    unitsDown: 0,
    efficiencyPct: 100,
    roomId: null,
    siteCode: "S1",
    roomCode: null,
  },
];

const CERTS: SerializedCertificate[] = [
  {
    id: 31,
    code: "CERT-001",
    name: "ใบรับรองหลัก",
    scope: "STATION",
    issuer: "กพว",
    certNo: "A-100",
    issuedAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2024-01-01T00:00:00.000Z",
    detail: null,
    siteId: 1,
    siteCode: "S1",
    siteName: "สถานี 1",
    buildingCode: null,
    roomCode: null,
  },
  {
    id: 32,
    code: "CERT-002",
    name: "ใบรองอาคาร",
    scope: "BUILDING",
    issuer: null,
    certNo: null,
    issuedAt: null,
    expiresAt: null,
    detail: null,
    siteId: 2,
    siteCode: "S2",
    siteName: "สถานี 2",
    buildingCode: "S2-B01",
    roomCode: null,
  },
];

const SECURITY: SerializedRoomSecurityRow[] = [
  {
    id: 41,
    code: "S1-B01-F1-R01",
    name: "ห้องเครื่องหลัก",
    siteCode: "S1",
    floorLabel: "ชั้น 1",
    cctvCount: 2,
    accessControl: "RFID Proximity Card, PIN Code",
    fireSuppression: "FM-200 (NO2O)",
    vesda: "VESDA (NO2O)",
  },
];

const HIERARCHY: EngHierarchySite[] = [
  {
    id: 1,
    code: "S1",
    name: "สถานี 1",
    buildings: [
      {
        id: 10,
        code: "S1-B01",
        name: "อาคารหลัก",
        floors: [
          {
            id: 100,
            code: "S1-B01-F1",
            label: "ชั้น 1",
            level: 1,
            rooms: [{ id: 1000, code: "S1-B01-F1-R01", name: "ห้องเครื่อง" }],
          },
        ],
      },
    ],
  },
  { id: 2, code: "S2", name: "สถานี 2", buildings: [] },
];

const TOTALS = { power: 2, cooling: 2, certs: 2, security: 1 };

function renderPage(canEdit = true) {
  return render(
    <EngineeringClient
      power={POWER}
      cooling={COOLING}
      certificates={CERTS}
      security={SECURITY}
      totals={TOTALS}
      canEdit={canEdit}
      hierarchy={HIERARCHY}
    />
  );
}

const tabButton = (label: string, count: number) =>
  screen.getByRole("button", { name: new RegExp(`${label}\\s*${count}`) });

describe("EngineeringClient — tabs & power filters", () => {
  beforeEach(() => {
    mocks.resolveNextAssetCode.mockReset();
    mocks.resolveNextAssetCode.mockResolvedValue("PWR-S1-002");
    mocks.deleteAsset.mockReset();
    mocks.deleteAsset.mockResolvedValue({ ok: true });
  });

  it("renders all tabs with counts and the power table by default", () => {
    renderPage();
    expect(tabButton("Power System", 2)).toBeInTheDocument();
    expect(tabButton("Cooling", 2)).toBeInTheDocument();
    expect(tabButton("ใบรับรอง", 2)).toBeInTheDocument();
    expect(tabButton("ความปลอดภัย", 1)).toBeInTheDocument();

    expect(screen.getByText("UPS A")).toBeInTheDocument();
    expect(screen.getByText("UPS B")).toBeInTheDocument();
    expect(screen.getByText("PWR-S1-001")).toBeInTheDocument();
    expect(screen.getAllByText("ปกติ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ซ่อมบำรุง").length).toBeGreaterThan(0);
  });

  it("shows the BTU number only, derived from btuTotal when btu is not set", () => {
    renderPage();
    fireEvent.click(tabButton("Cooling", 2));

    expect(screen.getByText("242,800")).toBeInTheDocument();
    expect(screen.getByText("120,000")).toBeInTheDocument();
  });

  it("shows count text and filters power by site", () => {
    renderPage();
    expect(screen.getByText("2 จาก 2 รายการ")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "S1" } });
    expect(screen.getByText("1 จาก 2 รายการ")).toBeInTheDocument();
    expect(screen.getByText("UPS A")).toBeInTheDocument();
    expect(screen.queryByText("UPS B")).toBeNull();
  });

  it("filters power by status checkbox and clears the filter", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("ซ่อมบำรุง"));

    expect(screen.getByText("UPS B")).toBeInTheDocument();
    expect(screen.queryByText("UPS A")).toBeNull();

    fireEvent.click(screen.getByText("ล้างตัวกรอง"));
    expect(screen.getByText("UPS A")).toBeInTheDocument();
  });

  it("hides add buttons and row actions when canEdit is false", () => {
    renderPage(false);
    expect(screen.queryByRole("button", { name: /เพิ่ม Power/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "แก้ไข" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ลบ" })).toBeNull();
  });
});

describe("EngineeringClient — asset create/edit/delete", () => {
  beforeEach(() => {
    mocks.createAsset.mockReset();
    mocks.createAsset.mockResolvedValue({ ok: true });
    mocks.updateAsset.mockReset();
    mocks.updateAsset.mockResolvedValue({ ok: true });
    mocks.deleteAsset.mockReset();
    mocks.deleteAsset.mockResolvedValue({ ok: true });
    mocks.resolveNextAssetCode.mockReset();
    mocks.resolveNextAssetCode.mockResolvedValue("PWR-S1-002");
  });

  it("deletes an asset only after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "ลบ" })[0]);
    expect(window.confirm).toHaveBeenCalledWith('ลบอุปกรณ์ "UPS A" (PWR-S1-001) แน่ใจหรือไม่?');
    await vi.waitFor(() => expect(mocks.deleteAsset).toHaveBeenCalledWith(11));

    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getAllByRole("button", { name: "ลบ" })[0]);
    expect(mocks.deleteAsset).toHaveBeenCalledTimes(1);
  });

  it("creates a POWER asset from the dialog", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /เพิ่ม Power/ }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("เพิ่ม Power System")).toBeInTheDocument();
    expect(within(dialog).getByText("รหัสจะถูกสร้างอัตโนมัติเมื่อเลือกสถานี")).toBeInTheDocument();

    const combos = within(dialog).getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "S1" } });
    expect(mocks.resolveNextAssetCode).toHaveBeenCalledWith("POWER", "S1");
    fireEvent.change(combos[2], { target: { value: "10" } });
    fireEvent.change(combos[3], { target: { value: "100" } });

    const nameInput = dialog.querySelector<HTMLInputElement>("input:not([disabled])")!;
    fireEvent.change(nameInput, { target: { value: "UPS ใหม่" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    await vi.waitFor(() =>
      expect(mocks.createAsset).toHaveBeenCalledWith(
        expect.objectContaining({ name: "UPS ใหม่", category: "POWER", floorId: "100", roomId: "" })
      )
    );
  });

  it("shows a mapped server error when asset creation fails", async () => {
    mocks.createAsset.mockResolvedValue({ ok: false, error: "invalid-input" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /เพิ่ม Power/ }));
    const dialog = await screen.findByRole("dialog");

    const combos = within(dialog).getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "S1" } });
    fireEvent.change(combos[2], { target: { value: "10" } });
    fireEvent.change(combos[3], { target: { value: "100" } });

    const nameInput = dialog.querySelector<HTMLInputElement>("input:not([disabled])")!;
    fireEvent.change(nameInput, { target: { value: "จะล้มเหลว" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("ข้อมูลไม่ถูกต้อง")).toBeInTheDocument();
  });

  it("prefills and updates an existing power asset", async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("button", { name: "แก้ไข" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("แก้ไขอุปกรณ์")).toBeInTheDocument();

    const nameInput = dialog.querySelector<HTMLInputElement>("input:not([disabled])")!;
    expect(nameInput.value).toBe("UPS A");

    fireEvent.change(nameInput, { target: { value: "UPS A2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    await vi.waitFor(() =>
      expect(mocks.updateAsset).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ name: "UPS A2", category: "POWER" })
      )
    );
  });

  it("creates a COOLING asset with cooling spec fields", async () => {
    renderPage();
    fireEvent.click(tabButton("Cooling", 2));
    fireEvent.click(screen.getByRole("button", { name: /เพิ่ม Cooling/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("เพิ่ม Cooling")).toBeInTheDocument();

    const combos = within(dialog).getAllByRole("combobox");
    fireEvent.change(combos[1], { target: { value: "S1" } });
    fireEvent.change(combos[2], { target: { value: "10" } });
    fireEvent.change(combos[3], { target: { value: "100" } });

    const nameInput = dialog.querySelector<HTMLInputElement>("input:not([disabled])")!;
    fireEvent.change(nameInput, { target: { value: "CRAC ใหม่" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    await vi.waitFor(() =>
      expect(mocks.createAsset).toHaveBeenCalledWith(
        expect.objectContaining({ name: "CRAC ใหม่", category: "COOLING" })
      )
    );
  });

  it("prefills the cooling BTU field from btuTotal when btu is not set", async () => {
    renderPage();
    fireEvent.click(tabButton("Cooling", 2));

    const row = screen.getByText("COOL-S1-002").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "แก้ไข" }));

    const dialog = await screen.findByRole("dialog");
    const btuInput = within(dialog).getByPlaceholderText("เช่น 242,800 BTU x2");
    expect(btuInput).toHaveValue("120,000");
  });
});

describe("EngineeringClient — certificates", () => {
  beforeEach(() => {
    mocks.createCertificate.mockReset();
    mocks.createCertificate.mockResolvedValue({ ok: true });
    mocks.updateCertificate.mockReset();
    mocks.updateCertificate.mockResolvedValue({ ok: true });
    mocks.deleteCertificate.mockReset();
    mocks.deleteCertificate.mockResolvedValue({ ok: true });
  });

  it("shows expired badge and deletes after confirm", async () => {
    renderPage();
    fireEvent.click(tabButton("ใบรับรอง", 2));

    expect(screen.getByText("หมดอายุแล้ว")).toBeInTheDocument();
    expect(screen.getByText("ใบรับรองหลัก")).toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getAllByRole("button", { name: "ลบ" })[0]);
    expect(window.confirm).toHaveBeenCalledWith('ลบใบรับรอง "ใบรับรองหลัก" (CERT-001) แน่ใจหรือไม่?');
    await vi.waitFor(() => expect(mocks.deleteCertificate).toHaveBeenCalledWith(31));
  });

  it("creates a certificate from the dialog", async () => {
    renderPage();
    fireEvent.click(tabButton("ใบรับรอง", 2));
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มใบรับรอง/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("เพิ่มใบรับรอง")).toBeInTheDocument();

    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "C-100" } });
    fireEvent.change(within(dialog).getAllByRole("textbox")[1], { target: { value: "ใบใหม่" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[1], { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    await vi.waitFor(() =>
      expect(mocks.createCertificate).toHaveBeenCalledWith(
        expect.objectContaining({ code: "C-100", name: "ใบใหม่", scope: "STATION", siteId: "1" })
      )
    );
  });

  it("maps the duplicate-code error from the server", async () => {
    mocks.createCertificate.mockResolvedValue({ ok: false, error: "duplicate-code" });
    renderPage();
    fireEvent.click(tabButton("ใบรับรอง", 2));
    fireEvent.click(screen.getByRole("button", { name: /เพิ่มใบรับรอง/ }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "C-100" } });
    fireEvent.change(within(dialog).getAllByRole("textbox")[1], { target: { value: "ใบใหม่" } });
    fireEvent.change(within(dialog).getAllByRole("combobox")[1], { target: { value: "1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    expect(await screen.findByText("รหัสซ้ำในระบบแล้ว")).toBeInTheDocument();
  });
});

describe("EngineeringClient — security tab", () => {
  beforeEach(() => {
    mocks.updateRoomSecurity.mockReset();
    mocks.updateRoomSecurity.mockResolvedValue({ ok: true });
  });

  it("renders badges, opens the read dialog, and saves edits", async () => {
    renderPage();
    fireEvent.click(tabButton("ความปลอดภัย", 1));

    expect(screen.getByText("ห้องเครื่องหลัก")).toBeInTheDocument();
    expect(screen.getByText("RFID Proximity Card")).toBeInTheDocument();
    expect(screen.getByText("FM-200")).toBeInTheDocument();
    expect(screen.getByText("2 ตัว")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ดูข้อมูล" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "ห้องเครื่องหลัก" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole("button", { name: "ปิด" })[0]);

    fireEvent.click(screen.getByRole("button", { name: "แก้ไข" }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("แก้ไขระบบความปลอดภัย: ห้องเครื่องหลัก")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    await vi.waitFor(() =>
      expect(mocks.updateRoomSecurity).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 41 })
      )
    );
  });

  it("shows the mapped error when the security save fails", async () => {
    mocks.updateRoomSecurity.mockResolvedValue({ ok: false, error: "server-error" });
    renderPage();
    fireEvent.click(tabButton("ความปลอดภัย", 1));
    fireEvent.click(screen.getByRole("button", { name: "แก้ไข" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("เกิดข้อผิดพลาด กรุณาลองใหม่")).toBeInTheDocument();
  });

  it("hides the edit button but keeps read when canEdit is false", () => {
    renderPage(false);
    fireEvent.click(tabButton("ความปลอดภัย", 1));
    expect(screen.getByRole("button", { name: "ดูข้อมูล" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แก้ไข" })).toBeNull();
  });
});