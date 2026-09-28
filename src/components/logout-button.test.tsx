// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: mocks.signOut },
}));

import LogoutButton from "./logout-button";

describe("LogoutButton", () => {
  beforeEach(() => {
    mocks.signOut.mockReset();
    mocks.refresh.mockReset();
  });

  it("renders the logout label", () => {
    render(<LogoutButton />);
    expect(screen.getByRole("button", { name: "ออกจากระบบ" })).toBeInTheDocument();
  });

  it("calls authClient.signOut on click", async () => {
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("refreshes the router after a successful sign-out", async () => {
    render(<LogoutButton />);
    fireEvent.click(screen.getByRole("button", { name: "ออกจากระบบ" }));

    const options = mocks.signOut.mock.calls[0][0];
    expect(options.fetchOptions.onSuccess).toBeTypeOf("function");

    options.fetchOptions.onSuccess();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});