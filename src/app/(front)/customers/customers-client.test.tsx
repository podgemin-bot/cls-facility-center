// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("./actions", () => ({
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  deleteCustomer: mocks.deleteCustomer,
}));

import CustomersClient from "./customers-client";
import type { SerializedCustomer } from "@/lib/cls";

const CUSTOMERS: SerializedCustomer[] = [
  {
    id: 1,
    code: "CUST-001",
    name: "National Telecom",
    stage: "INQUIRY",
    contactName: "สมชาย",
    contactPosition: "วิศวกรโครงข่าย",
    contactPhone: "081-111-1111",
    contactEmail: "a@nt.co.th",
    interestedRooms: ["PKB-F1-R01"],
    inquiryDate: "2026-09-01T00:00:00.000Z",
    contractNo: null,
    contractStart: null,
    contractEnd: null,
    note: null,
    rentedRoomCount: 0,
    rentedRooms: [],
  },
  {
    id: 2,
    code: "CUST-002",
    name: "True Corp",
    stage: "RENTING",
    contactName: "ทิพย์",
    contactPosition: "ผู้จัดการฝ่ายไอที",
    contactPhone: "082-222-2222",
    contactEmail: null,
    interestedRooms: [],
    inquiryDate: "2026-09-05T00:00:00.000Z",
    contractNo: "NT-2026-001",
    contractStart: "2026-10-01T00:00:00.000Z",
    contractEnd: "2027-09-30T00:00:00.000Z",
    note: "ดูแลสัญญา",
    rentedRoomCount: 2,
    rentedRooms: [
      { code: "PKB-F1-R01", name: "ห้องหลัก" },
      { code: "PKB-F1-R02", name: "ห้องสำรอง" },
    ],
  },
];

function renderPage(canEdit = true) {
  return render(<CustomersClient customers={CUSTOMERS} canEdit={canEdit} />);
}

const searchInput = () =>
  screen.getByRole("textbox", { name: "ค้นหาลูกค้า" });

describe("CustomersClient — list & filters", () => {
  it("renders all customers and the visible count", () => {
    renderPage();
    expect(screen.getByText("National Telecom")).toBeInTheDocument();
    expect(screen.getByText("True Corp")).toBeInTheDocument();
    expect(screen.getByText("วิศวกรโครงข่าย")).toBeInTheDocument();
    expect(screen.getByText("a@nt.co.th")).toBeInTheDocument();
    expect(screen.getByText("ดูแลสัญญา")).toBeInTheDocument();
    expect(screen.getByText("2 ราย")).toBeInTheDocument();
  });

  it("renders the requested customer columns", () => {
    renderPage();
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "ชื่อบริษัท",
      "ผู้ติดต่อ",
      "ตำแหน่งลูกค้า",
      "เบอร์โทร",
      "อีเมล",
      "หมายเหตุ",
      "ดู / แก้ไข",
    ]);
  });

  it("filters rows by the search query", async () => {
    const user = (await import("@testing-library/user-event")).default;
    renderPage();
    await user.type(searchInput(), "True");
    expect(screen.queryByText("National Telecom")).not.toBeInTheDocument();
    expect(screen.getByText("True Corp")).toBeInTheDocument();
    expect(screen.getByText("1 ราย")).toBeInTheDocument();
  });

  it("searches customer position and notes", () => {
    renderPage();
    fireEvent.change(searchInput(), { target: { value: "ผู้จัดการฝ่ายไอที" } });
    expect(screen.queryByText("National Telecom")).not.toBeInTheDocument();
    expect(screen.getByText("True Corp")).toBeInTheDocument();
  });

  it("hides add/edit/delete controls when canEdit is false", () => {
    renderPage(false);
    expect(screen.queryByRole("button", { name: "เพิ่มลูกค้า" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "แก้ไข" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ลบ" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "ดูข้อมูล" })).toHaveLength(2);
  });
});

describe("CustomersClient — create", () => {
  beforeEach(() => {
    mocks.createCustomer.mockResolvedValue({ ok: true });
  });

  it("opens the add dialog and saves the customer contact fields", async () => {
    const user = (await import("@testing-library/user-event")).default;
    renderPage();

    await user.click(screen.getByRole("button", { name: "เพิ่มลูกค้า" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("เพิ่มลูกค้าใหม่")).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText("ชื่อบริษัท/หน่วยงาน *");
    fireEvent.change(nameInput, {
      target: { value: "New Co" },
    });
    fireEvent.change(within(dialog).getByLabelText("ผู้ติดต่อ *"), {
      target: { value: "John Doe" },
    });
    fireEvent.change(within(dialog).getByLabelText("ตำแหน่งลูกค้า"), {
      target: { value: "Network Manager" },
    });
    fireEvent.change(within(dialog).getByLabelText("เบอร์โทร *"), {
      target: { value: "084-000-0000" },
    });
    fireEvent.change(within(dialog).getByLabelText("อีเมล"), {
      target: { value: "x@y.z" },
    });

    fireEvent.change(within(dialog).getByLabelText("หมายเหตุ"), {
      target: { value: "ติดตามแล้ว" },
    });

    expect(within(dialog).queryByLabelText("ขั้นตอน *")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("วันที่สอบถาม")).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/ห้องที่สนใจ/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText("ข้อมูลสัญญาเช่า")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    expect(mocks.createCustomer).toHaveBeenCalledTimes(1);
    expect(mocks.createCustomer).toHaveBeenCalledWith({
      id: undefined,
      name: "New Co",
      contactName: "John Doe",
      contactPosition: "Network Manager",
      contactPhone: "084-000-0000",
      contactEmail: "x@y.z",
      note: "ติดตามแล้ว",
    });

    await waitFor(() =>
      expect(screen.queryByText("เพิ่มลูกค้าใหม่")).not.toBeInTheDocument()
    );
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows the mapped error and keeps the dialog open on failure", async () => {
    mocks.createCustomer.mockResolvedValue({ ok: false, error: "unauthorized" });
    const user = (await import("@testing-library/user-event")).default;
    renderPage();

    await user.click(screen.getByRole("button", { name: "เพิ่มลูกค้า" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("ชื่อบริษัท/หน่วยงาน *"), {
      target: { value: "X" },
    });
    await user.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    expect(await screen.findByText("กรุณาเข้าสู่ระบบ")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("CustomersClient — edit", () => {
  beforeEach(() => {
    mocks.updateCustomer.mockResolvedValue({ ok: true });
  });

  it("prefills the form and saves edits via updateCustomer", async () => {
    const user = (await import("@testing-library/user-event")).default;
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "แก้ไข" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("แก้ไขลูกค้า: CUST-001")).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText("ชื่อบริษัท/หน่วยงาน *");
    expect(nameInput).toHaveValue("National Telecom");
    expect(within(dialog).getByLabelText("ตำแหน่งลูกค้า")).toHaveValue("วิศวกรโครงข่าย");

    fireEvent.change(within(dialog).getByLabelText("ผู้ติดต่อ *"), {
      target: { value: "สมชาย ใหม่" },
    });
    fireEvent.change(within(dialog).getByLabelText("ตำแหน่งลูกค้า"), {
      target: { value: "หัวหน้าวิศวกร" },
    });

    await user.click(within(dialog).getByRole("button", { name: "บันทึก" }));

    expect(mocks.updateCustomer).toHaveBeenCalledTimes(1);
    expect(mocks.updateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: "National Telecom",
        contactName: "สมชาย ใหม่",
        contactPosition: "หัวหน้าวิศวกร",
      })
    );
  });
});

describe("CustomersClient — delete", () => {
  beforeEach(() => {
    mocks.deleteCustomer.mockResolvedValue({ ok: true });
  });

  it("skips deletion when the confirm dialog is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = (await import("@testing-library/user-event")).default;
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "ลบ" })[0]);

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.deleteCustomer).not.toHaveBeenCalled();
  });

  it("deletes after confirm", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = (await import("@testing-library/user-event")).default;
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "ลบ" })[1]);

    expect(mocks.deleteCustomer).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCustomer).toHaveBeenCalledWith(2);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });
});

describe("CustomersClient — view detail", () => {
  it("opens the detail dialog with customer info", async () => {
    const user = (await import("@testing-library/user-event")).default;
    renderPage();

    await user.click(screen.getAllByRole("button", { name: "ดูข้อมูล" })[1]);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("True Corp")).toBeInTheDocument();
    expect(within(dialog).getByText("ผู้จัดการฝ่ายไอที")).toBeInTheDocument();
    expect(within(dialog).getByText("NT-2026-001")).toBeInTheDocument();
    expect(within(dialog).getByText("ดูแลสัญญา")).toBeInTheDocument();
    expect(within(dialog).getByText("PKB-F1-R01")).toBeInTheDocument();
    expect(within(dialog).getByText("PKB-F1-R02")).toBeInTheDocument();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
