"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

const ROLES = ["ADMIN", "EDITOR", "VIEWER"] as const;
export type Roles = (typeof ROLES)[number];

const isRole = (v: string): v is Roles => (ROLES as readonly string[]).includes(v);

export type AdminResult = { ok: boolean; error?: string };

async function requireAdmin(): Promise<null | string> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  if (!session?.user?.id) return "unauthorized";
  const user = await prisma.user
    .findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })
    .catch(() => null);
  if (!user || user.role !== "ADMIN") return "forbidden";
  return null;
}

export async function createUser(
  name: string,
  email: string,
  password: string,
  role: Roles
): Promise<AdminResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };

  if (!name.trim() || !email.trim() || password.length < 8) {
    return { ok: false, error: "invalid-input" };
  }
  if (!isRole(role)) {
    return { ok: false, error: "invalid-input" };
  }

  const normalized = email.trim().toLowerCase();

  const existing = await prisma.user
    .findUnique({ where: { email: normalized } })
    .catch(() => null);
  if (existing) return { ok: false, error: "email-exists" };

  try {
    const created = await auth.api.signUpEmail({
      body: { name: name.trim(), email: normalized, password },
    });
    await prisma.user.update({
      where: { id: created.user.id },
      data: { role },
    });
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: "server-error" };
  }
}

export async function setUserRole(
  userId: string,
  role: Roles
): Promise<AdminResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };
  if (!isRole(role)) return { ok: false, error: "invalid-input" };

  try {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return { ok: false, error: "not-found" };

    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id === userId && role !== "ADMIN") {
      return { ok: false, error: "cannot-demote-self" };
    }

    await prisma.user.update({ where: { id: userId }, data: { role } });
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: "server-error" };
  }
}

export async function deleteUserAction(userId: string): Promise<AdminResult> {
  const denied = await requireAdmin();
  if (denied) return { ok: false, error: denied };

  try {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return { ok: false, error: "not-found" };

    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user?.id === userId) {
      return { ok: false, error: "cannot-delete-self" };
    }

    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return { ok: false, error: "cannot-delete-last-admin" };
      }
    }

    await prisma.user.delete({ where: { id: userId } });
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: "server-error" };
  }
}
