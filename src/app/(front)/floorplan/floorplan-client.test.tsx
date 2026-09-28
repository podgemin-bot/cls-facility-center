// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { RoomStatus, SerializedFloorPlan } from "@/lib/cls";

const mocks = vi.hoisted(() => ({
  savePin: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("./actions", () => ({
  savePin: mocks.savePin,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/lightbox", () => ({
  Lightbox: () => null,
}));

import FloorplanClient from "./floorplan-client";

const FLOORS: SerializedFloorPlan[] = [
  {
    code: "S1-B01-F01",
    label: "ชั้น 1",
    level: 1,
    planImage: "/api/floors/1/plan/s1-b01-f01.png",
    siteCode: "S1",
    siteName: "สถานี 1",
    buildingCode: "S1-B01",
    buildingName: "อาคารหลัก",
    rooms: [
      {
        id: 1,
        code: "S1-B01-F01-R01",
        no: 1,
        name: "ห้องเครื่อง AC",
        status: "VACANT" as RoomStatus,
        areaSqm: 120,
        tenant: "บ. ก",
        pin: { id: 100, code: "PT-S1-B01-F01-001", x: 20, y: 30 },
      },
      {
        id: 2,
        code: "S1-B01-F01-R02",
        no: 2,
        name: "ห้องเซิร์ฟเวอร์",
        status: "OCCUPIED" as RoomStatus,
        areaSqm: null,
        tenant: null,
        pin: null,
      },
      {
        id: 3,
        code: "S1-B01-F01-R03",
        no: 3,
        name: "ห้องแบตเตอรี่",
        status: "OCCUPIED" as RoomStatus,
        areaSqm: null,
        tenant: null,
        pin: { id: 101, code: "PT-S1-B01-F01-002", x: 50, y: 60 },
      },
    ],
  },
  {
    code: "S1-B01-F02",
    label: "ชั้น 2",
    level: 2,
    planImage: null,
    siteCode: "S1",
    siteName: "สถานี 1",
    buildingCode: "S1-B01",
    buildingName: "อาคารหลัก",
    rooms: [
      {
        id: 4,
        code: "S1-B01-F02-R01",
        no: 1,
        name: "ห้องประชุม",
        status: "VACANT" as RoomStatus,
        areaSqm: null,
        tenant: null,
        pin: null,
      },
    ],
  },
  {
    code: "S2-B01-F01",
    label: "ชั้น 1",
    level: 1,
    planImage: null,
    siteCode: "S2",
    siteName: "สถานี B",
    buildingCode: "S2-B01",
    buildingName: "อาคาร B",
    rooms: [
      {
        id: 5,
        code: "S2-B01-F01-R05",
        no: 5,
        name: "ห้องเครื่อง B",
        status: "RESERVED" as RoomStatus,
        areaSqm: null,
        tenant: null,
        pin: null,
      },
    ],
  },
];

const PHOTOS: Record<number, { url: string; name: string }[]> = {
  1: [{ url: "/api/rooms/1/photos/a.jpg", name: "a.jpg" }],
};

function renderPage(canEdit = true, initialFloor = "") {
  return render(
    <FloorplanClient
      floors={FLOORS}
      photos={PHOTOS}
      initialFloor={initialFloor}
      canEdit={canEdit}
    />
  );
}

function mocksOk() {
  mocks.savePin.mockReset();
  mocks.savePin.mockResolvedValue({ ok: true });
  mocks.refresh.mockReset();
}

const R1_PIN = "S1-B01-F01-R01 · ห้องเครื่อง AC";
const R3_PIN = "S1-B01-F01-R03 · ห้องแบตเตอรี่";

describe("FloorplanClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocksOk();
  });

  it("renders the plan, pins, legend and room lists for the default floor", () => {
    renderPage();
    expect(screen.getByRole("combobox")).toHaveValue("S1");
    expect(screen.getByAltText("ผังชั้น อาคารหลัก ชั้น 1")).toBeInTheDocument();

    expect(screen.getByTitle(R1_PIN)).toBeInTheDocument();
    expect(screen.getByTitle(R3_PIN)).toBeInTheDocument();

    expect(screen.getByText("ห้องบนผัง (2)")).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มีหมุด (1)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ห้องเซิร์ฟเวอร์/ })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "ว่าง: 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "มีผู้ใช้งาน: 2" })).toBeInTheDocument();
  });

  it("hides pins when their status filter is toggled off", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "ว่าง: 1" }));
    expect(screen.queryByTitle(R1_PIN)).toBeNull();
    expect(screen.getByTitle(R3_PIN)).toBeInTheDocument();
  });

  it("switches floor and shows the no-plan placeholder", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /ชั้น 2/ }));
    expect(screen.queryByAltText(/ผังชั้น/)).toBeNull();
    expect(screen.getByText(/ไม่มีไฟล์ผังชั้นสำหรับชั้น 2นี้/)).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มีหมุดบนผังชั้นนี้")).toBeInTheDocument();
  });

  it("switches site and resets to its first floor", () => {
    renderPage();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "S2" } });
    expect(screen.getByRole("combobox")).toHaveValue("S2");
    expect(screen.getByText(/ไม่มีไฟล์ผังชั้นสำหรับชั้น 1นี้/)).toBeInTheDocument();
    expect(screen.getByText("ห้องเครื่อง B")).toBeInTheDocument();
  });

  it("honours the initialFloor prop", () => {
    renderPage(true, "S1-B01-F02");
    expect(screen.getByRole("combobox")).toHaveValue("S1");
    expect(screen.getByText(/ไม่มีไฟล์ผังชั้นสำหรับชั้น 2นี้/)).toBeInTheDocument();
    expect(screen.getByText("ยังไม่มีหมุดบนผังชั้นนี้")).toBeInTheDocument();
  });

  it("opens a room dialog from a pin with photos and a link back to rooms", async () => {
    renderPage();
    fireEvent.click(screen.getByTitle(R1_PIN));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("heading", { name: "ห้องเครื่อง AC" })).toBeInTheDocument();
    expect(within(dialog).getByText("ว่าง")).toBeInTheDocument();
    expect(within(dialog).getByText("120 ตร.ม.")).toBeInTheDocument();
    expect(within(dialog).getByText("บ. ก")).toBeInTheDocument();
    expect(within(dialog).getByText("PT-S1-B01-F01-001")).toBeInTheDocument();
    expect(within(dialog).getByText("ภาพถ่าย (1)")).toBeInTheDocument();
    expect(within(dialog).getByAltText("ห้องเครื่อง AC - a.jpg")).toBeInTheDocument();

    const link = within(dialog).getByRole("link", { name: /ดูข้อมูลทั้งหมดในหน้าห้อง/ });
    expect(link).toHaveAttribute("href", "/rooms?site=S1&floor=S1-B01-F01");

    fireEvent.click(within(dialog).getByAltText("ห้องเครื่อง AC - a.jpg"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens a dialog from the placed list and shows unplaced rooms without photos", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "ห้องแบตเตอรี่S1-B01-F01-R03" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "ห้องแบตเตอรี่" })).toBeInTheDocument();
    expect(within(dialog).getByText("PT-S1-B01-F01-002")).toBeInTheDocument();
    expect(within(dialog).queryByText(/ภาพถ่าย/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "ปิด" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const unplaced = screen.getByRole("button", { name: /ห้องเซิร์ฟเวอร์/ });
    expect(unplaced).toBeDisabled();
    fireEvent.click(unplaced);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("enters editor mode and activates a room by clicking its pin", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Pin Editor" }));
    expect(screen.getByText("โหมดวางหมุด:")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle(R3_PIN));
    const editorHeader = screen.getByText("โหมดวางหมุด:").closest("div")!;
    expect(within(editorHeader).getByText(R3_PIN)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("places a pin by clicking the plan in editor mode", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Pin Editor" }));

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "2" } });
    const editorHeader = screen.getByText("โหมดวางหมุด:").closest("div")!;
    expect(within(editorHeader).getByText("S1-B01-F01-R02 · ห้องเซิร์ฟเวอร์")).toBeInTheDocument();

    const img = screen.getByAltText("ผังชั้น อาคารหลัก ชั้น 1");
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(img, { clientX: 50, clientY: 25 });

    await vi.waitFor(() => expect(mocks.savePin).toHaveBeenCalledWith(2, 25, 25));
    await vi.waitFor(() =>
      expect(screen.getByTitle("S1-B01-F01-R02 · ห้องเซิร์ฟเวอร์")).toBeInTheDocument()
    );
    expect(screen.getByText("ห้องบนผัง (3)")).toBeInTheDocument();
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("shows the forbidden hint when a pin save is rejected", async () => {
    mocks.savePin.mockResolvedValue({ ok: false, error: "forbidden" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Pin Editor" }));

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "2" } });

    const img = screen.getByAltText("ผังชั้น อาคารหลัก ชั้น 1");
    vi.spyOn(img, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(img, { clientX: 50, clientY: 25 });
    expect(await screen.findByText(/บันทึกไม่สำเร็จ — ต้องเป็น admin\/editor/)).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("hides the editor and disables pinning when canEdit is false", async () => {
    renderPage(false);
    expect(screen.queryByRole("button", { name: "Pin Editor" })).toBeNull();
    expect(screen.getByText("เฉพาะ admin เท่านั้นที่วางหมุดได้")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ห้องเซิร์ฟเวอร์/ })).toBeDisabled();

    fireEvent.click(screen.getByTitle(R1_PIN));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "ห้องเครื่อง AC" })).toBeInTheDocument();
  });
});
