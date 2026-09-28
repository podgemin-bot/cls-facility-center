// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SecurityData, SerializedRoom } from "@/lib/cls";

const mocks = vi.hoisted(() => ({
  updateRoom: vi.fn(),
  updateRoomSecurity: vi.fn(),
  uploadRoomPhoto: vi.fn(),
  deleteRoomPhoto: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("./actions", () => ({
  updateRoom: mocks.updateRoom,
  updateRoomSecurity: mocks.updateRoomSecurity,
  uploadRoomPhoto: mocks.uploadRoomPhoto,
  deleteRoomPhoto: mocks.deleteRoomPhoto,
}));

import RoomsClient from "./rooms-client";

const ROOMS: SerializedRoom[] = [
  {
    id: 1,
    code: "S1-B01-F01-R01",
    no: 1,
    name: "ห้องเครื่อง AC",
    status: "VACANT",
    areaSqm: 120,
    ceilingHeightM: 3.5,
    raisedFloorCm: 15,
    floorLoadKgm2: 500,
    tenant: "บ. ก",
    floorCode: "S1-B01-F01",
    floorLabel: "ชั้น 1",
    level: 1,
    buildingCode: "S1-B01",
    buildingName: "อาคารหลัก",
    siteCode: "S1",
    siteName: "สถานี 1",
    security: {
      cctvCount: 4,
      accessControl: "RFID Proximity Card, PIN Code",
      fireSuppression: "Novec 1230 (FK-5-1-12)",
      vesda: "VESDA",
    } as SecurityData,
    cooling: [
      {
        code: "COOL-S1-001",
        name: "CRAC 1",
        model: "D20",
        specs: { btuTotal: 485600, unitsTotal: 2, unitsReady: 1, efficiencyPct: 88 },
      },
    ],
    photos: [
      { url: "/api/rooms/1/photos/a.jpg", name: "a.jpg" },
      { url: "/api/rooms/1/photos/b.jpg", name: "b.jpg" },
    ],
  },
  {
    id: 2,
    code: "S1-B01-F01-R02",
    no: 2,
    name: "ห้องเซิร์ฟเวอร์",
    status: "OCCUPIED",
    areaSqm: 80,
    ceilingHeightM: null,
    raisedFloorCm: 30,
    floorLoadKgm2: null,
    tenant: null,
    floorCode: "S1-B01-F01",
    floorLabel: "ชั้น 1",
    level: 1,
    buildingCode: "S1-B01",
    buildingName: "อาคารหลัก",
    siteCode: "S1",
    siteName: "สถานี 1",
    security: null,
    cooling: [],
    photos: [],
  },
  {
    id: 3,
    code: "S1-B01-F02-R01",
    no: 1,
    name: "ห้องประชุม",
    status: "MAINTENANCE",
    areaSqm: null,
    ceilingHeightM: null,
    raisedFloorCm: null,
    floorLoadKgm2: null,
    tenant: "บ. ข",
    floorCode: "S1-B01-F02",
    floorLabel: "ชั้น 2",
    level: 2,
    buildingCode: "S1-B01",
    buildingName: "อาคารหลัก",
    siteCode: "S1",
    siteName: "สถานี 1",
    security: null,
    cooling: [],
    photos: [],
  },
  {
    id: 4,
    code: "S1-B02-F01-R01",
    no: 1,
    name: "ห้องควบคุม",
    status: "VACANT",
    areaSqm: 60,
    ceilingHeightM: null,
    raisedFloorCm: null,
    floorLoadKgm2: null,
    tenant: null,
    floorCode: "S1-B02-F01",
    floorLabel: "ชั้น 1",
    level: 1,
    buildingCode: "S1-B02",
    buildingName: "อาคารรอง",
    siteCode: "S1",
    siteName: "สถานี 1",
    security: null,
    cooling: [],
    photos: [],
  },
  {
    id: 5,
    code: "S2-B01-F01-R05",
    no: 5,
    name: "ห้องเครื่อง B",
    status: "OCCUPIED",
    areaSqm: 90,
    ceilingHeightM: null,
    raisedFloorCm: null,
    floorLoadKgm2: null,
    tenant: null,
    floorCode: "S2-B01-F01",
    floorLabel: "ชั้น 1",
    level: 1,
    buildingCode: "S2-B01",
    buildingName: "อาคาร B",
    siteCode: "S2",
    siteName: "สถานี B",
    security: null,
    cooling: [],
    photos: [],
  },
  {
    id: 6,
    code: "S2-B01-F01-R06",
    no: 6,
    name: "ห้องแบตเตอรี่",
    status: "RESERVED",
    areaSqm: null,
    ceilingHeightM: null,
    raisedFloorCm: null,
    floorLoadKgm2: null,
    tenant: null,
    floorCode: "S2-B01-F01",
    floorLabel: "ชั้น 1",
    level: 1,
    buildingCode: "S2-B01",
    buildingName: "อาคาร B",
    siteCode: "S2",
    siteName: "สถานี B",
    security: null,
    cooling: [],
    photos: [],
  },
  {
    id: 7,
    code: "S2-B01-F02-R07",
    no: 7,
    name: "ห้องคลัง",
    status: "VACANT",
    areaSqm: null,
    ceilingHeightM: null,
    raisedFloorCm: null,
    floorLoadKgm2: null,
    tenant: null,
    floorCode: "S2-B01-F02",
    floorLabel: "ชั้น 2",
    level: 2,
    buildingCode: "S2-B01",
    buildingName: "อาคาร B",
    siteCode: "S2",
    siteName: "สถานี B",
    security: null,
    cooling: [],
    photos: [],
  },
];

function renderPage(opts: {
  rooms?: SerializedRoom[];
  initialSite?: string;
  initialBuilding?: string;
  initialFloor?: string;
  canEdit?: boolean;
} = {}) {
  return render(
    <RoomsClient
      rooms={opts.rooms ?? ROOMS}
      initialSite={opts.initialSite ?? ""}
      initialBuilding={opts.initialBuilding ?? ""}
      initialFloor={opts.initialFloor ?? ""}
      canEdit={opts.canEdit ?? true}
    />
  );
}

function mocksOk() {
  mocks.updateRoom.mockReset();
  mocks.updateRoom.mockResolvedValue({ ok: true });
  mocks.updateRoomSecurity.mockReset();
  mocks.updateRoomSecurity.mockResolvedValue({ ok: true });
  mocks.uploadRoomPhoto.mockReset();
  mocks.uploadRoomPhoto.mockResolvedValue({ ok: true });
  mocks.deleteRoomPhoto.mockReset();
  mocks.deleteRoomPhoto.mockResolvedValue({ ok: true });
  mocks.refresh.mockReset();
}

const siteSel = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;
const buildingSel = () => screen.getAllByRole("combobox")[1] as HTMLSelectElement;
const floorSel = () => screen.getAllByRole("combobox")[2] as HTMLSelectElement;
const statusSel = () => screen.getAllByRole("combobox")[3] as HTMLSelectElement;

async function openEditFor(name: string) {
  fireEvent.click(screen.getByText(name));
  const detail = await screen.findByRole("dialog");
  fireEvent.click(within(detail).getByRole("button", { name: "แก้ไข" }));
  const dialogs = await screen.findAllByRole("dialog");
  return dialogs[dialogs.length - 1];
}

describe("RoomsClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocksOk();
  });

  it("renders all rooms with filter selects and the result count", () => {
    renderPage();
    expect(screen.getByText("7 ห้อง")).toBeInTheDocument();
    const combos = screen.getAllByRole("combobox");
    expect(combos).toHaveLength(4);
    expect(screen.getByText("รหัสห้อง")).toBeInTheDocument();
    for (const r of ROOMS) {
      expect(screen.getByText(r.code)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("ห้องเครื่อง AC"));
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("filters rooms by site", () => {
    renderPage();
    fireEvent.change(siteSel(), { target: { value: "S1" } });
    expect(siteSel().value).toBe("S1");
    expect(screen.getByText("4 ห้อง")).toBeInTheDocument();
    expect(screen.getByText("S1-B01-F01-R01")).toBeInTheDocument();
    expect(screen.queryByText("S2-B01-F01-R05")).toBeNull();
  });

  it("filters rooms by building within a site", () => {
    renderPage();
    fireEvent.change(siteSel(), { target: { value: "S1" } });
    fireEvent.change(buildingSel(), { target: { value: "S1-B02" } });
    expect(buildingSel().value).toBe("S1-B02");
    expect(screen.getByText("1 ห้อง")).toBeInTheDocument();
    expect(screen.getByText("ห้องควบคุม")).toBeInTheDocument();
    expect(screen.queryByText("S1-B01-F01-R01")).toBeNull();
  });

  it("filters rooms by floor within site and building", () => {
    renderPage();
    fireEvent.change(siteSel(), { target: { value: "S1" } });
    fireEvent.change(buildingSel(), { target: { value: "S1-B01" } });
    fireEvent.change(floorSel(), { target: { value: "S1-B01-F02" } });
    expect(screen.getByText("1 ห้อง")).toBeInTheDocument();
    expect(screen.getByText("ห้องประชุม")).toBeInTheDocument();
    expect(screen.queryByText("S1-B01-F01-R02")).toBeNull();
  });

  it("filters rooms by status", () => {
    renderPage();
    fireEvent.change(statusSel(), { target: { value: "VACANT" } });
    expect(statusSel().value).toBe("VACANT");
    expect(screen.getByText("3 ห้อง")).toBeInTheDocument();
    expect(screen.getByText("S1-B02-F01-R01")).toBeInTheDocument();
    expect(screen.getByText("S2-B01-F02-R07")).toBeInTheDocument();
    expect(screen.queryByText("S1-B01-F01-R02")).toBeNull();
  });

  it("searches by room name and by room code", () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อห้อง/), {
      target: { value: "เซิร์ฟเวอร์" },
    });
    expect(screen.getByText("1 ห้อง")).toBeInTheDocument();
    expect(screen.getByText("S1-B01-F01-R02")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อห้อง/), {
      target: { value: "R06" },
    });
    expect(screen.getByText("1 ห้อง")).toBeInTheDocument();
    expect(screen.getByText("S2-B01-F01-R06")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/ค้นหาชื่อห้อง/), {
      target: { value: "zzz not here" },
    });
    expect(screen.getByText("ไม่พบห้องที่ตรงเงื่อนไข")).toBeInTheDocument();
    expect(screen.getByText("0 ห้อง")).toBeInTheDocument();
  });

  it("respects initial site/floor filters from props", () => {
    renderPage({ initialSite: "S1", initialFloor: "S1-B01-F02" });
    expect(siteSel().value).toBe("S1");
    expect(floorSel().value).toBe("S1-B01-F02");
    expect(screen.getByText("1 ห้อง")).toBeInTheDocument();
    expect(screen.getByText("ห้องประชุม")).toBeInTheDocument();
    expect(screen.queryByText("S1-B01-F01-R01")).toBeNull();
  });

  it("opens the room detail dialog with specs, security, cooling and photos", async () => {
    renderPage();
    fireEvent.click(screen.getByText("ห้องเครื่อง AC"));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("heading", { name: "ห้องเครื่อง AC" })).toBeInTheDocument();
    expect(within(dialog).getByText("สเปกห้อง")).toBeInTheDocument();
    expect(within(dialog).getByText("120 ตร.ม.")).toBeInTheDocument();
    expect(within(dialog).getByText("บ. ก")).toBeInTheDocument();

    expect(within(dialog).getByText("ระบบความปลอดภัย")).toBeInTheDocument();
    expect(within(dialog).getByText("4 ตัว")).toBeInTheDocument();
    expect(within(dialog).getByText("RFID Proximity Card, PIN Code")).toBeInTheDocument();

    expect(within(dialog).getByText("เครื่องปรับอากาศ")).toBeInTheDocument();
    expect(within(dialog).getByText("CRAC 1")).toBeInTheDocument();
    expect(within(dialog).getByText("COOL-S1-001")).toBeInTheDocument();

    expect(within(dialog).getByText("ภาพถ่าย (2)")).toBeInTheDocument();
    expect(within(dialog).getAllByAltText(/a.jpg|b.jpg/)).toHaveLength(2);
  });

  it("hides the edit button when canEdit is false", async () => {
    renderPage({ canEdit: false });
    fireEvent.click(screen.getByText("ห้องเซิร์ฟเวอร์"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "แก้ไข" })).toBeNull();
  });

  it("saves room and security edits from the dialog", async () => {
    renderPage();
    const editDialog = await openEditFor("ห้องเครื่อง AC");
    expect(within(editDialog).getByText("แก้ไข: ห้องเครื่อง AC")).toBeInTheDocument();

    const inputs = editDialog.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[1], { target: { value: "ห้องเครื่องใหม่" } });

    fireEvent.click(within(editDialog).getByRole("button", { name: "บันทึก" }));

    await vi.waitFor(() =>
      expect(mocks.updateRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          name: "ห้องเครื่องใหม่",
          status: "VACANT",
          no: "1",
          areaSqm: "120",
          tenant: "บ. ก",
        })
      )
    );
    await vi.waitFor(() =>
      expect(mocks.updateRoomSecurity).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 1,
          cctvCount: "4",
          accessControl: ["RFID Proximity Card", "PIN Code"],
          fireSuppression: "Novec 1230 (FK-5-1-12)",
          vesda: "VESDA",
        })
      )
    );
    expect(await screen.findByText("บันทึกข้อมูลห้องเรียบร้อย")).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("maps a server error to a readable label on save", async () => {
    mocks.updateRoom.mockResolvedValue({ ok: false, error: "not-found" });
    renderPage();
    const editDialog = await openEditFor("ห้องเครื่อง AC");
    fireEvent.click(within(editDialog).getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText("ไม่พบห้องนี้")).toBeInTheDocument();
  });

  it("uploads a photo after picking a file", async () => {
    renderPage();
    const editDialog = await openEditFor("ห้องเครื่อง AC");
    const file = new File(["x"], "c.jpg", { type: "image/jpeg" });
    const fileInput = editDialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await vi.waitFor(() =>
      expect(mocks.uploadRoomPhoto).toHaveBeenCalledWith(1, file)
    );
    expect(await screen.findByText("อัปโหลดรูปเรียบร้อย")).toBeInTheDocument();
  });

  it("maps an excessive photo size error", async () => {
    mocks.uploadRoomPhoto.mockResolvedValue({ ok: false, error: "too-large" });
    renderPage();
    const editDialog = await openEditFor("ห้องเครื่อง AC");
    const file = new File(["x"], "big.jpg", { type: "image/jpeg" });
    const fileInput = editDialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText("ไฟล์ใหญ่เกิน 10MB")).toBeInTheDocument();
  });

  it("deletes a photo only after confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const editDialog = await openEditFor("ห้องเครื่อง AC");

    fireEvent.click(within(editDialog).getAllByRole("button", { name: "ลบรูป" })[0]);
    expect(confirm).toHaveBeenCalledWith("ลบรูปนี้แน่ใจหรือไม่?");
    await vi.waitFor(() =>
      expect(mocks.deleteRoomPhoto).toHaveBeenCalledWith(1, "a.jpg")
    );
    expect(await screen.findByText("ลบรูปเรียบร้อย")).toBeInTheDocument();
  });

  it("skips photo deletion when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    const editDialog = await openEditFor("ห้องเครื่อง AC");

    fireEvent.click(within(editDialog).getAllByRole("button", { name: "ลบรูป" })[0]);
    await vi.waitFor(() => expect(mocks.deleteRoomPhoto).not.toHaveBeenCalled());
    expect(screen.queryByText("ลบรูปเรียบร้อย")).toBeNull();
  });

  it("closes the detail dialog", async () => {
    renderPage();
    fireEvent.click(screen.getByText("ห้องเครื่อง AC"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "ปิด" }));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
