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

import { NavigationSheet } from "./navigation-sheet";

describe("NavigationSheet", () => {
  it("shows an accessible mobile menu trigger button", () => {
    render(<NavigationSheet />);
    expect(
      screen.getByRole("button", { name: "เปิดเมนูนำทาง" })
    ).toBeInTheDocument();
  });

  it("opens the sheet and renders base navigation links", async () => {
    const user = (await import("@testing-library/user-event")).default;
    render(<NavigationSheet isLoggedIn isAdmin />);

    await user.click(screen.getByRole("button", { name: "เปิดเมนูนำทาง" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("แดชบอร์ด")).toHaveAttribute("href", "/");
    expect(screen.getByText("โปรไฟล์")).toHaveAttribute("href", "/profile");
    expect(screen.getByText("ดูแลระบบ")).toHaveAttribute("href", "/admin");
  });

  it("does not show profile/admin links when not logged in", async () => {
    const user = (await import("@testing-library/user-event")).default;
    render(<NavigationSheet />);

    await user.click(screen.getByRole("button", { name: "เปิดเมนูนำทาง" }));

    expect(screen.getByText("แดชบอร์ด")).toBeInTheDocument();
    expect(screen.queryByText("โปรไฟล์")).not.toBeInTheDocument();
    expect(screen.queryByText("ดูแลระบบ")).not.toBeInTheDocument();
  });
});
