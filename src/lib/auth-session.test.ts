import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));

describe("auth session boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getSession.mockReset();
    mocks.redirect.mockClear();
  });

  it("returns a validated session", async () => {
    const session = { user: { id: "user-1" }, session: { token: "token" } };
    mocks.getSession.mockResolvedValue(session);
    const { requireSession } = await import("./auth-session");

    await expect(requireSession()).resolves.toEqual(session);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects when better-auth rejects the cookie", async () => {
    mocks.getSession.mockResolvedValue(null);
    const { requireSession } = await import("./auth-session");

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects when session resolution fails", async () => {
    mocks.getSession.mockRejectedValue(new Error("database unavailable"));
    const { requireSession } = await import("./auth-session");

    await expect(requireSession()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
