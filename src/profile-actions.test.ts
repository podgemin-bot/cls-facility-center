import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: { getSession: mocks.getSession, revokeSession: mocks.revokeSession, revokeOtherSessions: mocks.revokeOtherSessions },
  },
}));

import { revokeOtherSessionsAction, revokeSessionAction } from "./app/(front)/profile/actions";

const SESSION = { session: { token: "t-current" }, user: { id: "u1" } };

describe("revokeSessionAction", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.revokeSession.mockReset();
    mocks.revokeOtherSessions.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when the user is not logged in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await revokeSessionAction("t-other");
    expect(res).toEqual({ ok: false, error: "unauthorized" });
    expect(mocks.revokeSession).not.toHaveBeenCalled();
  });

  it("refuses to revoke the current session", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    const res = await revokeSessionAction("t-current");
    expect(res).toEqual({ ok: false, error: "cannot-revoke-current" });
    expect(mocks.revokeSession).not.toHaveBeenCalled();
  });

  it("revokes another session and refreshes the router", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.revokeSession.mockResolvedValue({ status: true });

    const res = await revokeSessionAction("t-other");
    expect(res).toEqual({ ok: true });
    expect(mocks.revokeSession).toHaveBeenCalledTimes(1);
    expect(mocks.revokeSession.mock.calls[0][0].body).toEqual({ token: "t-other" });
  });

  it("maps failures to a server-error result", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.revokeSession.mockRejectedValue(new Error("boom"));

    const res = await revokeSessionAction("t-other");
    expect(res).toEqual({ ok: false, error: "server-error" });
  });
});

describe("revokeOtherSessionsAction", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.revokeSession.mockReset();
    mocks.revokeOtherSessions.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthorized when the user is not logged in", async () => {
    mocks.getSession.mockResolvedValue(null);
    const res = await revokeOtherSessionsAction();
    expect(res).toEqual({ ok: false, error: "unauthorized" });
    expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();
  });

  it("revokes every other session and refreshes the router", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.revokeOtherSessions.mockResolvedValue({ status: true });

    const res = await revokeOtherSessionsAction();
    expect(res).toEqual({ ok: true });
    expect(mocks.revokeOtherSessions).toHaveBeenCalledTimes(1);
  });

  it("maps failures to a server-error result", async () => {
    mocks.getSession.mockResolvedValue(SESSION);
    mocks.revokeOtherSessions.mockRejectedValue(new Error("boom"));

    const res = await revokeOtherSessionsAction();
    expect(res).toEqual({ ok: false, error: "server-error" });
  });
});