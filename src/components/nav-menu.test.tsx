// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

import { NavMenu } from "./nav-menu";

const STATIC_LINKS = [
  ["แดชบอร์ด", "/"],
  ["ห้องทั้งหมด", "/rooms"],
  ["สถานที่", "/locations"],
  ["ผังชั้น", "/floorplan"],
  ["ระบบวิศวกรรม", "/engineering"],
  ["ลูกค้า", "/customers"],
] as const;

describe("NavMenu", () => {
  it("renders all base navigation links", () => {
    render(<NavMenu />);
    for (const [label, href] of STATIC_LINKS) {
      expect(screen.getByText(label)).toHaveAttribute("href", href);
    }
  });

  it("hides profile and admin links when logged out", () => {
    render(<NavMenu />);
    expect(screen.queryByText("โปรไฟล์")).not.toBeInTheDocument();
    expect(screen.queryByText("ดูแลระบบ")).not.toBeInTheDocument();
  });

  it("shows the profile link when logged in", () => {
    render(<NavMenu isLoggedIn />);
    expect(screen.getByText("โปรไฟล์")).toHaveAttribute("href", "/profile");
    expect(screen.queryByText("ดูแลระบบ")).not.toBeInTheDocument();
  });

  it("shows the admin link when the user is an admin", () => {
    render(<NavMenu isAdmin />);
    expect(screen.getByText("ดูแลระบบ")).toHaveAttribute("href", "/admin");
    expect(screen.queryByText("โปรไฟล์")).not.toBeInTheDocument();
  });

  it("shows both profile and admin for a logged-in admin", () => {
    render(<NavMenu isLoggedIn isAdmin />);
    expect(screen.getByText("โปรไฟล์")).toHaveAttribute("href", "/profile");
    expect(screen.getByText("ดูแลระบบ")).toHaveAttribute("href", "/admin");
  });
});