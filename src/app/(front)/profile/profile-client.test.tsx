// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedProfileUser, SerializedSession } from "./page";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  revokeSessionAction: vi.fn(),
  revokeOtherSessionsAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    updateUser: mocks.updateUser,
    changePassword: mocks.changePassword,
  },
}));

vi.mock("./actions", () => ({
  revokeSessionAction: mocks.revokeSessionAction,
  revokeOtherSessionsAction: mocks.revokeOtherSessionsAction,
}));

import ProfileClient from "./profile-client";

const USER: SerializedProfileUser = {
  id: "u1",
  name: "สมชาย ใจดี",
  email: "somchai@example.com",
  role: "EDITOR",
  emailVerified: true,
  createdAt: "2025-01-15T00:00:00.000Z",
};

const CURRENT: SerializedSession = {
  token: "t-current",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
  ipAddress: "1.2.3.4",
  createdAt: "2026-01-01T10:00:00.000Z",
  expiresAt: "2027-01-01T10:00:00.000Z",
  isCurrent: true,
};

const OTHER: SerializedSession = {
  token: "t-other",
  userAgent:
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Mobile",
  ipAddress: "5.6.7.8",
  createdAt: "2026-02-02T11:00:00.000Z",
  expiresAt: "2027-02-02T11:00:00.000Z",
  isCurrent: false,
};

type AuthCallbacks = {
  onSuccess?: (v?: unknown) => void;
  onError?: (ctx: { error: { code?: string } }) => void;
};

function renderUi(
  sessions: SerializedSession[] = [CURRENT, OTHER],
  user: SerializedProfileUser = USER
) {
  render(<ProfileClient user={user} sessions={sessions} />);
}

function formOf(buttonName: string): HTMLFormElement {
  const form = (screen.getByRole("button", {
    name: buttonName,
  }) as HTMLButtonElement).form;
  if (!form) throw new Error(`no form found for button ${buttonName}`);
  return form as HTMLFormElement;
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submitNameForm() {
  fireEvent.submit(formOf("บันทึกชื่อ"));
}

function submitPasswordForm() {
  fireEvent.submit(formOf("เปลี่ยนรหัสผ่าน"));
}

describe("ProfileClient - info card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revokeSessionAction.mockResolvedValue({ ok: true });
    mocks.revokeOtherSessionsAction.mockResolvedValue({ ok: true });
  });

  it("renders name, email, role badge, email status and join date", () => {
    renderUi();
    expect(screen.getByText("สมชาย ใจดี")).toBeInTheDocument();
    expect(screen.getByText("somchai@example.com")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("ยืนยันแล้ว")).toBeInTheDocument();
    expect(
      screen.getByText(new Date(USER.createdAt).toLocaleDateString("th-TH"))
    ).toBeInTheDocument();
  });

  it("shows a role summary line for the current role", () => {
    renderUi();
    expect(
      screen.getByText("เพิ่ม แก้ไข และลบข้อมูลห้อง พื้นที่ และแผนผังได้")
    ).toBeInTheDocument();
  });

  it("prefills the name input with the current name", () => {
    renderUi();
    expect(screen.getByLabelText("ชื่อ")).toHaveValue("สมชาย ใจดี");
  });

  it("allows a long email address to wrap on narrow screens", () => {
    const email = "a-very-long-profile-email-address@example.test.local";
    renderUi([CURRENT], { ...USER, email });

    expect(screen.getByText(email)).toHaveClass("break-all");
  });
});

describe("ProfileClient - change name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls updateUser on submit and shows a success alert on success", async () => {
    let resolveUpdate!: () => void;
    let callbacks: AuthCallbacks | undefined;
    mocks.updateUser.mockImplementation(
      (_data: unknown, opts: AuthCallbacks) =>
        new Promise<void>((resolve) => {
          callbacks = opts;
          resolveUpdate = resolve;
        })
    );
    renderUi();

    fill("ชื่อ", "ใหม่");
    submitNameForm();

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledTimes(1));
    expect(mocks.updateUser.mock.calls[0][0]).toEqual({ name: "ใหม่" });

    act(() => {
      callbacks?.onSuccess?.();
      resolveUpdate();
    });

    expect(await screen.findByText("อัปเดตชื่อสำเร็จ")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("อัปเดตชื่อสำเร็จ");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("maps an updateUser error to a Thai message", async () => {
    let callbacks: AuthCallbacks | undefined;
    mocks.updateUser.mockImplementation(
      (_data: unknown, opts: AuthCallbacks) =>
        new Promise<void>((resolve) => {
          callbacks = opts;
          resolve();
        })
    );
    renderUi();

    fill("ชื่อ", "ใหม่");
    submitNameForm();

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledTimes(1));
    act(() => {
      callbacks?.onError?.({ error: { code: "server-error" } });
    });

    expect(
      await screen.findByText("เกิดข้อผิดพลาด กรุณาลองใหม่")
    ).toBeInTheDocument();
  });

  it("disables the submit button and shows busy text while saving", async () => {
    let resolveUpdate!: () => void;
    mocks.updateUser.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    renderUi();

    fill("ชื่อ", "ใหม่");
    submitNameForm();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "กำลังบันทึก..." })
      ).toBeDisabled()
    );

    act(() => resolveUpdate());

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "บันทึกชื่อ" })
      ).not.toBeDisabled()
    );
  });
});

describe("ProfileClient - change password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates password length and does not call changePassword", async () => {
    renderUi();

    fill("รหัสผ่านปัจจุบัน", "OldPass12345!");
    fill("รหัสผ่านใหม่", "abc");
    fill("ยืนยันรหัสผ่านใหม่", "abc");
    submitPasswordForm();

    expect(
      await screen.findByText("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
    ).toBeInTheDocument();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("validates matching confirm password", async () => {
    renderUi();

    fill("รหัสผ่านปัจจุบัน", "OldPass12345!");
    fill("รหัสผ่านใหม่", "NewPass12345!");
    fill("ยืนยันรหัสผ่านใหม่", "DifferentPass!");
    submitPasswordForm();

    expect(await screen.findByText("รหัสผ่านไม่ตรงกัน")).toBeInTheDocument();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("calls changePassword with the right payload and shows success", async () => {
    let resolveChange!: () => void;
    let callbacks: AuthCallbacks | undefined;
    mocks.changePassword.mockImplementation(
      (_data: unknown, opts: AuthCallbacks) =>
        new Promise<void>((resolve) => {
          callbacks = opts;
          resolveChange = resolve;
        })
    );
    renderUi();

    fill("รหัสผ่านปัจจุบัน", "OldPass12345!");
    fill("รหัสผ่านใหม่", "NewPass12345!");
    fill("ยืนยันรหัสผ่านใหม่", "NewPass12345!");
    submitPasswordForm();

    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledTimes(1));
    expect(mocks.changePassword.mock.calls[0][0]).toEqual({
      currentPassword: "OldPass12345!",
      newPassword: "NewPass12345!",
      revokeOtherSessions: true,
    });

    act(() => {
      callbacks?.onSuccess?.();
      resolveChange();
    });

    expect(await screen.findByText("เปลี่ยนรหัสผ่านสำเร็จ")).toBeInTheDocument();
    expect(screen.getByLabelText("รหัสผ่านใหม่")).toHaveValue("");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("maps an invalid current password error to Thai", async () => {
    let callbacks: AuthCallbacks | undefined;
    mocks.changePassword.mockImplementation(
      (_data: unknown, opts: AuthCallbacks) =>
        new Promise<void>((resolve) => {
          callbacks = opts;
          resolve();
        })
    );
    renderUi();

    fill("รหัสผ่านปัจจุบัน", "WrongPass!");
    fill("รหัสผ่านใหม่", "NewPass12345!");
    fill("ยืนยันรหัสผ่านใหม่", "NewPass12345!");
    submitPasswordForm();

    await waitFor(() => expect(mocks.changePassword).toHaveBeenCalledTimes(1));
    act(() => {
      callbacks?.onError?.({ error: { code: "invalid-password" } });
    });

    expect(
      await screen.findByText("รหัสผ่านปัจจุบันไม่ถูกต้อง")
    ).toBeInTheDocument();
  });

  it("toggles password visibility with the eye buttons", () => {
    renderUi();

    const currentField = screen.getByLabelText("รหัสผ่านปัจจุบัน");
    const eyeButton = within(
      currentField.closest("div.relative") as HTMLElement
    ).getByRole("button", { name: "แสดงรหัสผ่าน" });
    fireEvent.click(eyeButton);

    expect(screen.getByLabelText("รหัสผ่านปัจจุบัน")).toHaveAttribute(
      "type",
      "text"
    );
    expect(
      within(currentField.closest("div.relative") as HTMLElement).getByRole(
        "button",
        { name: "ซ่อนรหัสผ่าน" }
      )
    ).toBeInTheDocument();
  });
});

describe("ProfileClient - sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revokeSessionAction.mockResolvedValue({ ok: true });
    mocks.revokeOtherSessionsAction.mockResolvedValue({ ok: true });
  });

  it("renders a session per device with labels and marks the current one", () => {
    renderUi();

    expect(screen.getByText("คอมพิวเตอร์")).toBeInTheDocument();
    expect(screen.getByText("มือถือ / แท็บเล็ต")).toBeInTheDocument();
    expect(screen.getByText("อุปกรณ์นี้")).toBeInTheDocument();
    expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument();
  });

  it("only shows a revoke button for non-current sessions", () => {
    renderUi();

    const revokeButtons = screen.getAllByRole("button", {
      name: "ออกจากระบบ",
    });
    expect(revokeButtons).toHaveLength(1);
    expect(revokeButtons[0].closest("li")).toHaveTextContent(
      "มือถือ / แท็บเล็ต"
    );
  });

  it("revokes a single session and shows success", async () => {
    renderUi();

    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));

    await waitFor(() =>
      expect(mocks.revokeSessionAction).toHaveBeenCalledWith("t-other")
    );
    expect(
      await screen.findByText("ออกจากระบบอุปกรณ์นั้นแล้ว")
    ).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("maps a session action error to a Thai message", async () => {
    mocks.revokeSessionAction.mockResolvedValue({
      ok: false,
      error: "cannot-revoke-current",
    });
    renderUi();

    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));

    expect(
      await screen.findByText("ไม่สามารถออกจากระบบอุปกรณ์นี้ได้")
    ).toBeInTheDocument();
  });

  it("requires confirmation before revoking all other sessions", async () => {
    renderUi();

    fireEvent.click(
      screen.getByRole("button", { name: "ออกจากระบบอุปกรณ์อื่นทั้งหมด" })
    );
    expect(
      screen.getByText("ต้องการออกจากระบบอุปกรณ์อื่นทั้งหมดหรือไม่?")
    ).toBeInTheDocument();
    expect(mocks.revokeOtherSessionsAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "ยืนยัน" }));

    await waitFor(() =>
      expect(mocks.revokeOtherSessionsAction).toHaveBeenCalledTimes(1)
    );
    expect(
      await screen.findByText("ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว")
    ).toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("disables revoking others when there is only the current session", () => {
    renderUi([CURRENT]);

    expect(
      screen.getByRole("button", { name: "ออกจากระบบอุปกรณ์อื่นทั้งหมด" })
    ).toBeDisabled();
  });
});
