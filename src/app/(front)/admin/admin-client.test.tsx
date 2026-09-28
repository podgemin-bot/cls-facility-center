// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SerializedAdminUser } from "./page";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  setUserRole: vi.fn(),
  deleteUserAction: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("./actions", () => ({
  createUser: mocks.createUser,
  setUserRole: mocks.setUserRole,
  deleteUserAction: mocks.deleteUserAction,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.reload }),
}));

import AdminClient from "./admin-client";

const USERS: SerializedAdminUser[] = [
  {
    id: "u1",
    name: "Admin One",
    email: "admin@test.local",
    role: "ADMIN",
    emailVerified: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    isSelf: true,
  },
  {
    id: "u2",
    name: "Editor Two",
    email: "editor@test.local",
    role: "EDITOR",
    emailVerified: false,
    createdAt: "2026-01-02T00:00:00.000Z",
    isSelf: false,
  },
  {
    id: "u3",
    name: "Viewer Three",
    email: "viewer@test.local",
    role: "VIEWER",
    emailVerified: true,
    createdAt: "2026-01-03T00:00:00.000Z",
    isSelf: false,
  },
];

const passwordInputs = () => screen.getAllByPlaceholderText("••••••••");
const createRoleSelect = () => screen.getByRole("combobox", { name: "เลือกสิทธิ์สำหรับสร้าง" });
const filterSelect = () => screen.getByRole("combobox", { name: "กรองตามสิทธิ์" });
const rowSelect = (name: string) => screen.getByRole("combobox", { name: `สิทธิ์ของ ${name}` });

function renderPage(users: SerializedAdminUser[] = USERS) {
  return render(<AdminClient users={users} />);
}

function resetMocks() {
  mocks.createUser.mockReset();
  mocks.createUser.mockResolvedValue({ ok: true });
  mocks.setUserRole.mockReset();
  mocks.setUserRole.mockResolvedValue({ ok: true });
  mocks.deleteUserAction.mockReset();
  mocks.deleteUserAction.mockResolvedValue({ ok: true });
  mocks.reload.mockReset();
}

describe("AdminClient — user list", () => {
  beforeEach(resetMocks);

  it("renders users with role counts and self badge", () => {
    renderPage();

    expect(screen.getByText("ทั้งหมด:")).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Admin:")).toBeInTheDocument();
    expect(screen.getByText("Editor:")).toBeInTheDocument();
    expect(screen.getByText("Viewer:")).toBeInTheDocument();
    expect(screen.getByText("admin@test.local")).toBeInTheDocument();
    expect(screen.getByText("editor@test.local")).toBeInTheDocument();
    expect(screen.getByText("คุณ")).toBeInTheDocument();
  });

  it("marks verified vs unverified emails", () => {
    renderPage();
    expect(screen.getAllByText("ยืนยันแล้ว")).toHaveLength(2);
    expect(screen.getByText("ยังไม่ยืนยัน")).toBeInTheDocument();
  });
});

describe("AdminClient — search & filter", () => {
  beforeEach(resetMocks);

  it("shows all rows by default", () => {
    renderPage();
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("filters rows by email text", async () => {
    renderPage();
    await userEvent.type(screen.getByRole("textbox", { name: "ค้นหาชื่อหรืออีเมล" }), "viewer@test.local");
    expect(screen.getByText("viewer@test.local")).toBeInTheDocument();
    expect(screen.queryByText("admin@test.local")).not.toBeInTheDocument();
    expect(screen.queryByText("editor@test.local")).not.toBeInTheDocument();
  });

  it("filters rows by name text", async () => {
    renderPage();
    await userEvent.type(screen.getByRole("textbox", { name: "ค้นหาชื่อหรืออีเมล" }), "Editor");
    expect(screen.getByText("editor@test.local")).toBeInTheDocument();
    expect(screen.queryByText("admin@test.local")).not.toBeInTheDocument();
  });

  it("filters by role via the filter select", async () => {
    renderPage();
    fireEvent.change(filterSelect(), { target: { value: "ADMIN" } });
    expect(screen.getByText("admin@test.local")).toBeInTheDocument();
    expect(screen.queryByText("editor@test.local")).not.toBeInTheDocument();
    expect(screen.queryByText("viewer@test.local")).not.toBeInTheDocument();
  });

  it("combines search and role filter", async () => {
    renderPage();
    fireEvent.change(filterSelect(), { target: { value: "EDITOR" } });
    await userEvent.type(screen.getByRole("textbox", { name: "ค้นหาชื่อหรืออีเมล" }), "Two");
    expect(screen.getByText("editor@test.local")).toBeInTheDocument();
    expect(screen.queryByText("viewer@test.local")).not.toBeInTheDocument();
  });

  it("shows a matching empty state when nothing matches", async () => {
    renderPage();
    await userEvent.type(screen.getByRole("textbox", { name: "ค้นหาชื่อหรืออีเมล" }), "zzz-no-match");
    expect(screen.getByText("ไม่พบผู้ใช้ที่ตรงเงื่อนไข")).toBeInTheDocument();
    expect(screen.queryByText("ยังไม่มีผู้ใช้")).not.toBeInTheDocument();
  });

  it("clears results back to all rows", async () => {
    renderPage();
    const search = screen.getByRole("textbox", { name: "ค้นหาชื่อหรืออีเมล" });
    await userEvent.type(search, "Admin");
    expect(screen.queryByText("editor@test.local")).not.toBeInTheDocument();
    await userEvent.clear(search);
    expect(screen.getByText("editor@test.local")).toBeInTheDocument();
  });
});

describe("AdminClient — create user form", () => {
  beforeEach(resetMocks);

  it("binds fields through accessible labels", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("ชื่อ"), "ทดสอบ 1");
    await userEvent.type(screen.getByLabelText("อีเมล"), "new@test.local");
    expect(screen.getByLabelText("ชื่อ")).toHaveValue("ทดสอบ 1");
    expect(screen.getByLabelText("อีเมล")).toHaveValue("new@test.local");
  });

  it("toggles password visibility with the show/hide button", async () => {
    renderPage();
    const [first] = passwordInputs();
    expect(first).toHaveAttribute("type", "password");
    await userEvent.click(screen.getByRole("button", { name: "แสดงรหัสผ่าน" }));
    expect(first).toHaveAttribute("type", "text");
    await userEvent.click(screen.getByRole("button", { name: "ซ่อนรหัสผ่าน" }));
    expect(first).toHaveAttribute("type", "password");
  });

  it("shows a live mismatch hint while typing, then blocks submit", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("ชื่อ"), "ทดสอบ 1");
    await user.type(screen.getByLabelText("อีเมล"), "new@test.local");
    await user.type(passwordInputs()[0], "Secret1234");
    await user.type(passwordInputs()[1], "Secret5678");

    expect(screen.getByText("รหัสผ่านไม่ตรงกัน")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "สร้างผู้ใช้" }));
    // alert replaces the live hint, still without calling the server
    expect(screen.getAllByText("รหัสผ่านไม่ตรงกัน")).not.toHaveLength(0);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("warns when password is too short (invalid-input)", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("ชื่อ"), "ทดสอบ 1");
    await user.type(screen.getByLabelText("อีเมล"), "new@test.local");
    await user.type(passwordInputs()[0], "short");
    await user.type(passwordInputs()[1], "short");
    await user.click(screen.getByRole("button", { name: "สร้างผู้ใช้" }));

    expect(
      await screen.findByText("กรอกข้อมูลไม่ถูกต้อง (รหัสผ่านขั้นต่ำ 8 ตัว)")
    ).toBeInTheDocument();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("creates a user with the requested role and resets the form", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("ชื่อ"), "ทดสอบ 1");
    await user.type(screen.getByLabelText("อีเมล"), "new@test.local");
    await user.type(passwordInputs()[0], "Secret1234");
    await user.type(passwordInputs()[1], "Secret1234");
    fireEvent.change(createRoleSelect(), { target: { value: "EDITOR" } });

    await user.click(screen.getByRole("button", { name: "สร้างผู้ใช้" }));

    expect(await screen.findByText('สร้างผู้ใช้ "new@test.local" สำเร็จ')).toBeInTheDocument();
    expect(mocks.createUser).toHaveBeenCalledWith(
      "ทดสอบ 1",
      "new@test.local",
      "Secret1234",
      "EDITOR"
    );
    expect(screen.getByLabelText("อีเมล")).toHaveValue("");
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("shows the mapped server error when creation fails", async () => {
    mocks.createUser.mockResolvedValue({ ok: false, error: "email-exists" });
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("ชื่อ"), "ทดสอบ 2");
    await user.type(screen.getByLabelText("อีเมล"), "dup@test.local");
    await user.type(passwordInputs()[0], "Secret1234");
    await user.type(passwordInputs()[1], "Secret1234");

    await user.click(screen.getByRole("button", { name: "สร้างผู้ใช้" }));

    expect(await screen.findByText("อีเมลนี้ถูกใช้แล้ว")).toBeInTheDocument();
  });
});

describe("AdminClient — role change", () => {
  beforeEach(resetMocks);

  it("updates a non-self user role via setUserRole and refreshes", async () => {
    renderPage();

    fireEvent.change(rowSelect("Editor Two"), { target: { value: "ADMIN" } });

    expect(await screen.findByText("อัปเดตสิทธิ์ของ Editor Two สำเร็จ")).toBeInTheDocument();
    expect(mocks.setUserRole).toHaveBeenCalledWith("u2", "ADMIN");
    expect(mocks.reload).toHaveBeenCalled();
  });

  it("blocks self-demotion in the UI without calling the server", async () => {
    renderPage();

    fireEvent.change(rowSelect("Admin One"), { target: { value: "VIEWER" } });

    expect(await screen.findByText("ไม่สามารถลดสิทธิ์ตัวเองได้")).toBeInTheDocument();
    expect(mocks.setUserRole).not.toHaveBeenCalled();
  });

  it("keeps the ADMIN role change for self allowed after a blocked demotion", async () => {
    renderPage();

    fireEvent.change(rowSelect("Admin One"), { target: { value: "VIEWER" } });
    expect(await screen.findByText("ไม่สามารถลดสิทธิ์ตัวเองได้")).toBeInTheDocument();

    fireEvent.change(rowSelect("Admin One"), { target: { value: "ADMIN" } });

    expect(await screen.findByText("อัปเดตสิทธิ์ของ Admin One สำเร็จ")).toBeInTheDocument();
    expect(mocks.setUserRole).toHaveBeenCalledWith("u1", "ADMIN");
  });

  it("shows the mapped server error on a failed role update", async () => {
    mocks.setUserRole.mockResolvedValue({ ok: false, error: "not-found" });
    renderPage();

    fireEvent.change(rowSelect("Viewer Three"), { target: { value: "ADMIN" } });

    expect(await screen.findByText("ไม่พบผู้ใช้")).toBeInTheDocument();
  });

  it("disables row selects while a role update is pending", async () => {
    let release!: (v: unknown) => void;
    mocks.setUserRole.mockReturnValue(
      new Promise((res) => {
        release = res;
      })
    );
    renderPage();

    fireEvent.change(rowSelect("Viewer Three"), { target: { value: "EDITOR" } });

    expect(screen.getByText("กำลังอัปเดต...")).toBeInTheDocument();
    expect(rowSelect("Viewer Three")).toBeDisabled();
    expect(rowSelect("Editor Two")).toBeDisabled();

    release({ ok: true });
    expect(await screen.findByText("อัปเดตสิทธิ์ของ Viewer Three สำเร็จ")).toBeInTheDocument();
    await waitFor(() => expect(rowSelect("Viewer Three")).toBeEnabled());
    expect(rowSelect("Editor Two")).toBeEnabled();
  });
});

describe("AdminClient — delete user", () => {
  beforeEach(resetMocks);

  it("renders a delete button per row and disables it for self", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "ลบผู้ใช้ Editor Two" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "ลบผู้ใช้ Viewer Three" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "ลบผู้ใช้ Admin One" })).toBeDisabled();
  });

  it("disables delete for the last ADMIN row", () => {
    renderPage([
      {
        id: "me",
        name: "Manager Me",
        email: "me@test.local",
        role: "VIEWER",
        emailVerified: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        isSelf: true,
      },
      {
        id: "only-admin",
        name: "Sole Admin",
        email: "sole@test.local",
        role: "ADMIN",
        emailVerified: true,
        createdAt: "2026-01-02T00:00:00.000Z",
        isSelf: false,
      },
    ]);
    expect(screen.getByRole("button", { name: "ลบผู้ใช้ Sole Admin" })).toBeDisabled();
  });

  it("opens a confirm dialog and cancels without calling the action", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "ลบผู้ใช้ Editor Two" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Editor Two");
    expect(dialog.textContent).toContain("editor@test.local");

    await userEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.deleteUserAction).not.toHaveBeenCalled();
  });

  it("confirms deletion, calls the action and shows success", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "ลบผู้ใช้ Editor Two" }));
    await userEvent.click(await screen.findByRole("button", { name: "ยืนยันการลบ" }));

    expect(await screen.findByText('ลบผู้ใช้ "Editor Two" สำเร็จ')).toBeInTheDocument();
    expect(mocks.deleteUserAction).toHaveBeenCalledWith("u2");
    expect(mocks.reload).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the mapped server error when deletion fails", async () => {
    mocks.deleteUserAction.mockResolvedValue({ ok: false, error: "cannot-delete-last-admin" });
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "ลบผู้ใช้ Editor Two" }));
    await userEvent.click(await screen.findByRole("button", { name: "ยืนยันการลบ" }));

    expect(
      await screen.findByText("ต้องมีผู้ดูแลระบบ (Admin) อย่างน้อย 1 คน")
    ).toBeInTheDocument();
    expect(mocks.deleteUserAction).toHaveBeenCalledWith("u2");
  });
});

describe("AdminClient — section-isolated feedback", () => {
  beforeEach(resetMocks);

  it("keeps create-form feedback separate from role-change feedback", async () => {
    renderPage();

    // create success
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("ชื่อ"), "ทดสอบ 1");
    await user.type(screen.getByLabelText("อีเมล"), "new@test.local");
    await user.type(passwordInputs()[0], "Secret1234");
    await user.type(passwordInputs()[1], "Secret1234");
    await user.click(screen.getByRole("button", { name: "สร้างผู้ใช้" }));
    expect(await screen.findByText('สร้างผู้ใช้ "new@test.local" สำเร็จ')).toBeInTheDocument();

    // role change success appears in the list card, not the create card
    fireEvent.change(rowSelect("Viewer Three"), { target: { value: "EDITOR" } });
    expect(await screen.findByText("อัปเดตสิทธิ์ของ Viewer Three สำเร็จ")).toBeInTheDocument();

    expect(screen.queryByText(/อัปเดตสิทธิ์ของ/)).toBeInTheDocument();
    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toEqual([
      'สร้างผู้ใช้ "new@test.local" สำเร็จ',
      "อัปเดตสิทธิ์ของ Viewer Three สำเร็จ",
    ]);
  });

  it("clears create alert while typing new input", async () => {
    mocks.createUser.mockResolvedValue({ ok: false, error: "email-exists" });
    renderPage();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("ชื่อ"), "ทดสอบ 2");
    await user.type(screen.getByLabelText("อีเมล"), "dup@test.local");
    await user.type(passwordInputs()[0], "Secret1234");
    await user.type(passwordInputs()[1], "Secret1234");
    await user.click(screen.getByRole("button", { name: "สร้างผู้ใช้" }));
    expect(await screen.findByText("อีเมลนี้ถูกใช้แล้ว")).toBeInTheDocument();

    await user.type(screen.getByLabelText("อีเมล"), "x");
    await waitFor(() => expect(screen.queryByText("อีเมลนี้ถูกใช้แล้ว")).not.toBeInTheDocument());
  });
});