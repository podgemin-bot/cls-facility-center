// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ cookie: "better-auth.session_token=token.sig" }),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: mocks.findUnique } },
}));

vi.mock("./logout-button", () => ({
  default: () => <button type="button">ออกจากระบบ</button>,
}));

import Navbar from "./navbar";

async function renderNavbar() {
  const element = await Navbar();
  render(element);
}

describe("Navbar (async RSC)", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.findUnique.mockReset();
  });

  it("shows login link and base menu when logged out", async () => {
    mocks.getSession.mockResolvedValue(null);

    await renderNavbar();

    expect(screen.getByText("เข้าสู่ระบบ")).toHaveAttribute("href", "/login");
    expect(screen.getByText("แดชบอร์ด")).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "ออกจากระบบ" })).not.toBeInTheDocument();
    expect(screen.queryByText("ดูแลระบบ")).not.toBeInTheDocument();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("greets a logged-in non-admin and shows profile menu", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", name: "สมชาย" } });
    mocks.findUnique.mockResolvedValue({ role: "EDITOR" });

    await renderNavbar();

    expect(screen.getByText(/สวัสดี, สมชาย/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ออกจากระบบ" })).toBeInTheDocument();
    expect(screen.queryByText("เข้าสู่ระบบ")).not.toBeInTheDocument();
    expect(screen.getByText("โปรไฟล์")).toHaveAttribute("href", "/profile");
    expect(screen.queryByText("ดูแลระบบ")).not.toBeInTheDocument();
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } })
    );
  });

  it("reveals the admin link for ADMIN users", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", name: "Admin" } });
    mocks.findUnique.mockResolvedValue({ role: "ADMIN" });

    await renderNavbar();

    expect(screen.getByText("ดูแลระบบ")).toHaveAttribute("href", "/admin");
    expect(screen.getByText("โปรไฟล์")).toHaveAttribute("href", "/profile");
  });

  it("falls back to non-admin when the role lookup fails", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "u1", name: "สมชาย" } });
    mocks.findUnique.mockRejectedValue(new Error("db down"));

    await renderNavbar();

    expect(screen.getByRole("button", { name: "ออกจากระบบ" })).toBeInTheDocument();
    expect(screen.getByText("โปรไฟล์")).toBeInTheDocument();
    expect(screen.queryByText("ดูแลระบบ")).not.toBeInTheDocument();
  });
});