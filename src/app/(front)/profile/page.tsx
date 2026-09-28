import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/auth-session";
import ProfileClient from "./profile-client";

export const instant = false;

export const metadata: Metadata = { title: "โปรไฟล์" };

export type SerializedProfileUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
};

export type SerializedSession = {
  token: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
};

type BetterSession = {
  token: string;
  userAgent: string;
  ipAddress: string;
  createdAt: Date;
  expiresAt: Date;
};

export default async function ProfilePage() {
  await connection();
  const session = await requireSession();

  const user = await prisma.user
    .findUnique({ where: { id: session.user.id } })
    .catch(() => null);

  if (!user) {
    redirect("/login");
  }

  const serialized: SerializedProfileUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };

  const sessions = await auth.api
    .listSessions({ headers: await headers() })
    .catch(() => [] as BetterSession[]);

  const serializedSessions: SerializedSession[] = (sessions ?? []).map((s) => ({
    token: s.token,
    userAgent: s.userAgent ?? "",
    ipAddress: s.ipAddress ?? "",
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    isCurrent: s.token === session?.session?.token,
  }));

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">โปรไฟล์</h1>
        <p className="text-sm text-muted-foreground">
          จัดการข้อมูลส่วนตัวและความปลอดภัยของบัญชี
        </p>
      </div>
      <ProfileClient user={serialized} sessions={serializedSessions} />
    </div>
  );
}
