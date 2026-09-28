import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    auth: {
      ...actual.auth,
      api: {
        ...actual.auth.api,
        getSession: mocks.getSession,
      },
    },
  };
});

import prisma from "@/lib/prisma";
import { createUser, deleteUserAction, setUserRole } from "./app/(front)/admin/actions";

const ADMIN_ID = "__admin_crud__";
const ADMIN_EMAIL = "admin-crud@test.local";
const EDITOR_ID = "__editor_crud__";
const DELETABLE_ADMIN_ID = "__admin_deletable__";
const createdIds: string[] = [];

const NEW_USER = {
  name: "ผู้ใช้ใหม่เทสต์",
  email: `admin-crud-${Date.now()}@test.local`,
  password: "StrongPass123!",
  role: "EDITOR" as const,
};

beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: ADMIN_ID },
    update: { role: "ADMIN" },
    create: { id: ADMIN_ID, name: "Admin CRUD", email: ADMIN_EMAIL, role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { id: EDITOR_ID },
    update: { role: "EDITOR" },
    create: { id: EDITOR_ID, name: "Editor CRUD", email: "editor-crud@test.local", role: "EDITOR" },
  });
  await prisma.user.upsert({
    where: { id: DELETABLE_ADMIN_ID },
    update: { role: "ADMIN" },
    create: { id: DELETABLE_ADMIN_ID, name: "Deletable Admin", email: "deletable-admin@test.local", role: "ADMIN" },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: "admin-crud-" } } });
});

afterAll(async () => {
  for (const id of createdIds) {
    await prisma.account.deleteMany({ where: { userId: id } });
    await prisma.session.deleteMany({ where: { userId: id } });
  }
  await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "admin-crud-" } } });
  await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, EDITOR_ID, DELETABLE_ADMIN_ID] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.getSession.mockResolvedValue({ user: { id: ADMIN_ID } });
});

describe("admin user role CRUD actions (real DB, auth getSession mocked)", () => {
  it("createUser signs up a user and assigns the requested role", async () => {
    const res = await createUser(NEW_USER.name, NEW_USER.email, NEW_USER.password, NEW_USER.role);
    expect(res.ok).toBe(true);

    const row = await prisma.user.findUnique({ where: { email: NEW_USER.email } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe(NEW_USER.name);
    expect(row?.role).toBe("EDITOR");
    createdIds.push(row!.id);
  });

  it("createUser returns email-exists for a duplicate", async () => {
    const res = await createUser("ซ้ำ", NEW_USER.email, NEW_USER.password, "VIEWER");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("email-exists");
  });

  it("createUser rejects invalid input (name/email/password-length)", async () => {
    expect(
      (await createUser("  ", "a@b.c", "Password123!", "VIEWER")).error
    ).toBe("invalid-input");
    expect(
      (await createUser("ชื่อ", " ", "Password123!", "VIEWER")).error
    ).toBe("invalid-input");
    expect(
      (await createUser("ชื่อ", "a@b.c", "short", "VIEWER")).error
    ).toBe("invalid-input");
  });

  it("createUser rejects an unknown role", async () => {
    const res = await createUser("ชื่อ", "x-role@test.local", "Password123!", "SUPER" as never);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid-input");
  });

  it("createUser is blocked when unauthenticated", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const res = await createUser("ชื่อ", "unauth@test.local", "Password123!", "VIEWER");
    expect(res.error).toBe("unauthorized");
  });

  it("createUser is blocked for non-admin roles", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: EDITOR_ID } });
    const res = await createUser("ชื่อ", "editor-block@test.local", "Password123!", "VIEWER");
    expect(res.error).toBe("forbidden");
  });

  it("setUserRole updates another user's role", async () => {
    const res = await setUserRole(EDITOR_ID, "VIEWER");
    expect(res.ok).toBe(true);

    const row = await prisma.user.findUnique({ where: { id: EDITOR_ID } });
    expect(row?.role).toBe("VIEWER");

    await prisma.user.update({ where: { id: EDITOR_ID }, data: { role: "EDITOR" } });
  });

  it("setUserRole rejects an unknown role", async () => {
    const res = await setUserRole(EDITOR_ID, "SUPER" as never);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid-input");
  });

  it("setUserRole returns not-found for a missing user", async () => {
    const res = await setUserRole("no-such-user-id", "VIEWER");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("not-found");
  });

  it("setUserRole refuses to demote the current admin", async () => {
    const res = await setUserRole(ADMIN_ID, "EDITOR");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("cannot-demote-self");
  });

  it("setUserRole is blocked when unauthenticated", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const res = await setUserRole(EDITOR_ID, "VIEWER");
    expect(res.error).toBe("unauthorized");
  });
});

describe("deleteUserAction (real DB, auth getSession mocked)", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue({ user: { id: ADMIN_ID } });
  });

  it("deletes a non-admin user and cascades their accounts and sessions", async () => {
    const email = `delete-cascade-${Date.now()}@test.local`;
    const created = await createUser("คนถูกลบ", email, "StrongPass123!", "VIEWER");
    expect(created.ok).toBe(true);

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row).not.toBeNull();

    const del = await deleteUserAction(row!.id);
    expect(del).toEqual({ ok: true });

    expect(await prisma.user.findUnique({ where: { id: row!.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: row!.id } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: row!.id } })).toBe(0);
  });

  it("returns not-found for a missing user", async () => {
    const res = await deleteUserAction("no-such-user-id");
    expect(res.error).toBe("not-found");
  });

  it("refuses to delete the current admin", async () => {
    const res = await deleteUserAction(ADMIN_ID);
    expect(res).toEqual({ ok: false, error: "cannot-delete-self" });
  });

  it("allows deleting an ADMIN when another admin remains", async () => {
    const email = `admin-delete-${Date.now()}@test.local`;
    const created = await createUser("Admin คนที่ 3", email, "StrongPass123!", "ADMIN");
    expect(created.ok).toBe(true);

    const row = await prisma.user.findUnique({ where: { email } });
    const del = await deleteUserAction(row!.id);
    expect(del).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: row!.id } })).toBeNull();
  });

  it("refuses to delete the last ADMIN (no other admin would remain)", async () => {
    const origCount = prisma.user.count;
    prisma.user.count = (() => Promise.resolve(1)) as typeof prisma.user.count;
    try {
      const res = await deleteUserAction(DELETABLE_ADMIN_ID);
      expect(res).toEqual({ ok: false, error: "cannot-delete-last-admin" });
    } finally {
      prisma.user.count = origCount;
    }
  });

  it("is blocked when unauthenticated", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const res = await deleteUserAction(EDITOR_ID);
    expect(res.error).toBe("unauthorized");
  });

  it("is blocked for non-admin roles", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: EDITOR_ID } });
    const res = await deleteUserAction(ADMIN_ID);
    expect(res.error).toBe("forbidden");
  });
});