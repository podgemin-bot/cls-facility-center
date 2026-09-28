// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  SerializedBuilding,
  SerializedFloor,
  SerializedLocationRoom,
  SerializedSite,
} from "@/lib/cls";

const mocks = vi.hoisted(() => ({
  createSite: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
  createBuilding: vi.fn(),
  updateBuilding: vi.fn(),
  deleteBuilding: vi.fn(),
  createFloor: vi.fn(),
  updateFloor: vi.fn(),
  deleteFloor: vi.fn(),
  createRoom: vi.fn(),
  updateRoom: vi.fn(),
  deleteRoom: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("./actions", () => ({
  createSite: mocks.createSite,
  updateSite: mocks.updateSite,
  deleteSite: mocks.deleteSite,
  createBuilding: mocks.createBuilding,
  updateBuilding: mocks.updateBuilding,
  deleteBuilding: mocks.deleteBuilding,
  createFloor: mocks.createFloor,
  updateFloor: mocks.updateFloor,
  deleteFloor: mocks.deleteFloor,
  createRoom: mocks.createRoom,
  updateRoom: mocks.updateRoom,
  deleteRoom: mocks.deleteRoom,
}));

import LocationsClient from "./locations-client";

const SITES: SerializedSite[] = [
  {
    id: 1,
    code: "S1",
    name: "สถานี 1",
    province: "ระยอง",
    lat: 12.5,
    lng: 101.2,
    buildingCount: 1,
    floorCount: 1,
    roomCount: 1,
  },
  {
    id: 2,
    code: "S2",
    name: "สถานี 2",
    province: "ชลบุรี",
    lat: null,
    lng: null,
    buildingCount: 0,
    floorCount: 0,
    roomCount: 0,
  },
];

const BUILDINGS: SerializedBuilding[] = [
  {
    id: 10,
    code: "S1-B01",
    name: "อาคารหลัก",
    siteCode: "S1",
    siteName: "สถานี 1",
    floorCount: 1,
    roomCount: 1,
  },
];

const FLOORS: SerializedFloor[] = [
  {
    id: 100,
    code: "S1-B01-F1",
    level: 1,
    label: "ชั้น 1",
    planImage: null,
    buildingCode: "S1-B01",
    buildingName: "อาคารหลัก",
    siteCode: "S1",
    roomCount: 1,
  },
];

const ROOMS: SerializedLocationRoom[] = [
  {
    id: 1000,
    code: "S1-B01-F1-R01",
    no: 1,
    name: "ห้องเครื่อง",
    status: "OCCUPIED",
    areaSqm: 120,
    tenant: "บ. ก",
    floorCode: "S1-B01-F1",
    floorLabel: "ชั้น 1",
  },
];

function renderPage(canEdit = true) {
  return render(
    <LocationsClient
      sites={SITES}
      buildings={BUILDINGS}
      floors={FLOORS}
      rooms={ROOMS}
      canEdit={canEdit}
    />
  );
}

function mocksOk() {
  mocks.createSite.mockResolvedValue({ ok: true });
  mocks.updateSite.mockResolvedValue({ ok: true });
  mocks.deleteSite.mockResolvedValue({ ok: true });
  mocks.createBuilding.mockResolvedValue({ ok: true });
  mocks.updateBuilding.mockResolvedValue({ ok: true });
  mocks.deleteBuilding.mockResolvedValue({ ok: true });
  mocks.createFloor.mockResolvedValue({ ok: true });
  mocks.updateFloor.mockResolvedValue({ ok: true });
  mocks.deleteFloor.mockResolvedValue({ ok: true });
  mocks.createRoom.mockResolvedValue({ ok: true });
  mocks.updateRoom.mockResolvedValue({ ok: true });
  mocks.deleteRoom.mockResolvedValue({ ok: true });
  mocks.refresh.mockReset();
}

function goToBuildings() {
  fireEvent.click(screen.getAllByRole("button", { name: /ดูรายละเอียด/ })[0]);
}

function goToFloors() {
  fireEvent.click(screen.getByRole("button", { name: /ดูชั้น/ }));
}

function goToRooms() {
  fireEvent.click(screen.getByRole("button", { name: /ดูห้อง/ }));
}

const saveBtn = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: "บันทึก" });

describe("LocationsClient — sites level", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocksOk();
  });

  it("renders site cards with counts and the edit table", () => {
    renderPage();
    expect(screen.getByText("สถานที่")).toBeInTheDocument();
    expect(screen.getAllByText("สถานี 1")).toHaveLength(2);
    expect(screen.getAllByText("ดูรายละเอียด")).toHaveLength(2);
    expect(screen.getByText("จ.ชลบุรี")).toBeInTheDocument();
    expect(screen.getByText("ชื่อสถานี")).toBeInTheDocument();
  });

  it("hides the add button and table when canEdit is false", () => {
    renderPage(false);
    expect(screen.queryByRole("button", { name: "เพิ่มสถานี" })).toBeNull();
    expect(screen.queryByText("ชื่อสถานี")).toBeNull();
    expect(screen.getAllByText("ดูรายละเอียด")).toHaveLength(2);
  });

  it("creates a site from the dialog", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มสถานี" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("เพิ่มสถานีใหม่")).toBeInTheDocument();

    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[0], { target: { value: "pak" } });
    fireEvent.change(inputs[1], { target: { value: "สถานี ป." } });
    fireEvent.change(inputs[2], { target: { value: "กรุงเทพ" } });
    fireEvent.change(inputs[3], { target: { value: "13.7" } });
    fireEvent.change(inputs[4], { target: { value: "100.5" } });

    fireEvent.click(saveBtn(dialog));
    await vi.waitFor(() =>
      expect(mocks.createSite).toHaveBeenCalledWith(
        expect.objectContaining({ code: "PAK", name: "สถานี ป.", province: "กรุงเทพ", lat: "13.7", lng: "100.5" })
      )
    );
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("shows the mapped error when site creation fails", async () => {
    mocks.createSite.mockResolvedValue({ ok: false, error: "invalid-site-code" });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มสถานี" }));
    const dialog = await screen.findByRole("dialog");

    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[0], { target: { value: "PAK" } });
    fireEvent.change(inputs[1], { target: { value: "สถานี ป." } });
    fireEvent.change(inputs[2], { target: { value: "กรุงเทพ" } });

    fireEvent.click(saveBtn(dialog));
    expect(
      await screen.findByText("รหัสสถานีต้องเป็นตัวอักษร/ตัวเลขภาษาอังกฤษ ยาวไม่เกิน 10 ตัว")
    ).toBeInTheDocument();
  });

  it("prefills and updates a site, then deletes it after confirm", async () => {
    renderPage();
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getAllByRole("button")[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("แก้ไขสถานี")).toBeInTheDocument();
    expect(dialog.querySelector<HTMLInputElement>("input:not([disabled])")?.value).toBe("สถานี 1");
    expect(dialog.querySelector<HTMLInputElement>("input")!.disabled).toBe(true);

    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[1], { target: { value: "สถานีหนึ่ง" } });
    fireEvent.click(saveBtn(dialog));
    await vi.waitFor(() => expect(mocks.updateSite).toHaveBeenCalledWith(1, expect.objectContaining({ name: "สถานีหนึ่ง" })));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(screen.getByRole("table")).getAllByRole("button")[1]);
    expect(confirm).toHaveBeenCalledWith(
      "ลบสถานี สถานี 1 และข้อมูลทั้งหมดใต้สถานีนี้ แน่ใจหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้"
    );
    await vi.waitFor(() => expect(mocks.deleteSite).toHaveBeenCalledWith(1));
  });
});

describe("LocationsClient — buildings/floors/rooms navigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocksOk();
  });

  it("drills into buildings, floors and rooms through the breadcrumb", async () => {
    renderPage();

    goToBuildings();
    expect(screen.getAllByText("อาคารหลัก")).toHaveLength(2);
    expect(screen.getByText("1 ชั้น")).toBeInTheDocument();
    expect(screen.getByText("1 ห้อง")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ทั้งหมด" }));
    expect(screen.getByText("เพิ่มสถานี")).toBeInTheDocument();

    goToBuildings();
    goToFloors();
    expect(screen.getAllByText("ชั้น 1")).toHaveLength(2);
    expect(screen.getByText("ดูห้อง")).toBeInTheDocument();
    expect(screen.queryByText("เพิ่มอาคาร")).toBeNull();

    goToRooms();
    expect(screen.getByText("ห้องเครื่อง")).toBeInTheDocument();
    expect(screen.getByText("มีผู้ใช้งาน")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ไปหน้าห้องทั้งหมด/ })).toHaveAttribute(
      "href",
      "/rooms?floor=S1-B01-F1"
    );

    expect(screen.getByText("S1-B01-F1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ทั้งหมด" }));
    expect(screen.getByText("เพิ่มสถานี")).toBeInTheDocument();
  });

  it("creates a building and shows the auto-generated site code", async () => {
    renderPage();
    goToBuildings();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มอาคาร" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("เพิ่มอาคารใหม่")).toBeInTheDocument();
    expect(within(dialog).getByText("รหัสอาคารจะสร้างอัตโนมัติตามสถานี S1")).toBeInTheDocument();

    const nameInput = dialog.querySelector<HTMLInputElement>("input:not([disabled])")!;
    fireEvent.change(nameInput, { target: { value: "อาคารใหม่" } });
    fireEvent.click(saveBtn(dialog));
    await vi.waitFor(() =>
      expect(mocks.createBuilding).toHaveBeenCalledWith(expect.objectContaining({ siteId: 1, name: "อาคารใหม่" }))
    );
  });

  it("creates a floor with a live code preview", async () => {
    renderPage();
    goToBuildings();
    goToFloors();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มชั้น" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("เพิ่มชั้นใหม่")).toBeInTheDocument();

    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[1], { target: { value: "2" } });
    fireEvent.change(inputs[2], { target: { value: "ชั้น 2" } });
    expect(within(dialog).getByText("S1-B01-F02")).toBeInTheDocument();

    fireEvent.click(saveBtn(dialog));
    await vi.waitFor(() =>
      expect(mocks.createFloor).toHaveBeenCalledWith(expect.objectContaining({ buildingId: 10, level: "2", label: "ชั้น 2" }))
    );
  });

  it("creates a room with code preview and native status select", async () => {
    renderPage();
    goToBuildings();
    goToFloors();
    goToRooms();
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มห้อง" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("เพิ่มห้องใหม่")).toBeInTheDocument();
    expect(within(dialog).getByText("รหัสห้องจะสร้างอัตโนมัติตามชั้น S1-B01-F1")).toBeInTheDocument();

    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[0], { target: { value: "2" } });
    fireEvent.change(inputs[1], { target: { value: "ห้องเซิร์ฟเวอร์" } });
    fireEvent.change(
      within(dialog).getByRole("combobox"),
      { target: { value: "MAINTENANCE" } }
    );
    expect(within(dialog).getByText("S1-B01-F1-R02")).toBeInTheDocument();

    fireEvent.click(saveBtn(dialog));
    await vi.waitFor(() =>
      expect(mocks.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({ floorId: 100, no: "2", name: "ห้องเซิร์ฟเวอร์", status: "MAINTENANCE" })
      )
    );
  });

  it("edits a room through the table and deletes it after confirm", async () => {
    renderPage();
    goToBuildings();
    goToFloors();
    goToRooms();
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getAllByRole("button")[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("แก้ไขห้อง: ห้องเครื่อง")).toBeInTheDocument();

    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    fireEvent.change(inputs[0], { target: { value: "5" } });
    fireEvent.click(saveBtn(dialog));
    await vi.waitFor(() => expect(mocks.updateRoom).toHaveBeenCalledWith(1000, expect.objectContaining({ no: "5" })));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(within(screen.getByRole("table")).getAllByRole("button")[1]);
    expect(confirm).toHaveBeenCalledWith(
      "ลบห้อง S1-B01-F1-R01 แน่ใจหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้"
    );
    await vi.waitFor(() => expect(mocks.deleteRoom).toHaveBeenCalledWith(1000));
  });

  it("hides editor affordances on every level when canEdit is false", async () => {
    renderPage(false);
    expect(screen.queryByRole("button", { name: "เพิ่มสถานี" })).toBeNull();
    goToBuildings();
    expect(screen.queryByRole("button", { name: "เพิ่มอาคาร" })).toBeNull();
    goToFloors();
    expect(screen.queryByRole("button", { name: "เพิ่มชั้น" })).toBeNull();
    goToRooms();
    expect(screen.queryByRole("button", { name: "เพิ่มห้อง" })).toBeNull();
    expect(within(screen.getByRole("table")).queryAllByRole("button")).toHaveLength(0);
  });
});