"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  deleteRoomPhotoFile,
  PrivateImageError,
  saveRoomPhoto,
} from "@/lib/private-images";
import type { RoomStatus } from "@/lib/cls";
import {
  ACCESS_CONTROL_OPTIONS,
  FIRE_SUPPRESSION_OPTIONS,
  SMOKE_DETECTOR_OPTIONS,
  joinAccessControl,
} from "@/lib/cls";

export type RoomResult = { ok: boolean; error?: string };

const STATUSES: RoomStatus[] = ["VACANT", "OCCUPIED", "MAINTENANCE", "RESERVED"];

async function requireEditor(): Promise<string | null> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  if (!session?.user?.id) return "unauthorized";
  const user = await prisma.user
    .findUnique({ where: { id: session.user.id }, select: { role: true } })
    .catch(() => null);
  if (!user || (user.role !== "ADMIN" && user.role !== "EDITOR")) return "forbidden";
  return null;
}

const toNum = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export type UpdateRoomInput = {
  id: number;
  name: string;
  status: string;
  no: string;
  areaSqm: string;
  ceilingHeightM: string;
  raisedFloorCm: string;
  floorLoadKgm2: string;
  tenant: string;
};

export async function updateRoom(input: UpdateRoomInput): Promise<RoomResult> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "invalid-input" };
  if (!STATUSES.includes(input.status as RoomStatus)) {
    return { ok: false, error: "invalid-input" };
  }

  try {
    const room = await prisma.room.findUnique({ where: { id: input.id } });
    if (!room) return { ok: false, error: "not-found" };

    await prisma.room.update({
      where: { id: input.id },
      data: {
        name,
        status: input.status as RoomStatus,
        no: toNum(input.no) ?? room.no,
        areaSqm: toNum(input.areaSqm),
        ceilingHeightM: toNum(input.ceilingHeightM),
        raisedFloorCm: toNum(input.raisedFloorCm),
        floorLoadKgm2: toNum(input.floorLoadKgm2),
        tenant: input.tenant.trim() || null,
      },
    });
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: "server-error" };
  }
}

export type SecurityInput = {
  roomId: number;
  cctvCount: string;
  accessControl: string[];
  fireSuppression: string;
  vesda: string;
};

function normalizeAccessControl(vals: string[]): string | null {
  const allowed = new Set<string>(ACCESS_CONTROL_OPTIONS);
  const cleaned = vals.filter((v) => allowed.has(v.trim()));
  return joinAccessControl(cleaned);
}

export async function updateRoomSecurity(input: SecurityInput): Promise<RoomResult> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };

  const accessControl = normalizeAccessControl(input.accessControl);
  const fireSuppression = (FIRE_SUPPRESSION_OPTIONS as readonly string[]).includes(
    input.fireSuppression.trim()
  )
    ? input.fireSuppression.trim() || null
    : null;
  const vesda = (SMOKE_DETECTOR_OPTIONS as readonly string[]).includes(input.vesda.trim())
    ? input.vesda.trim() || null
    : null;

  try {
    const room = await prisma.room.findUnique({ where: { id: input.roomId } });
    if (!room) return { ok: false, error: "not-found" };

    await prisma.roomSecurity.upsert({
      where: { roomId: input.roomId },
      create: {
        roomId: input.roomId,
        cctvCount: toNum(input.cctvCount),
        accessControl,
        fireSuppression,
        vesda,
      },
      update: {
        cctvCount: toNum(input.cctvCount),
        accessControl,
        fireSuppression,
        vesda,
      },
    });
    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: "server-error" };
  }
}

export async function uploadRoomPhoto(
  roomId: number,
  file: File
): Promise<RoomResult> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };
  if (!Number.isSafeInteger(roomId) || roomId <= 0) return { ok: false, error: "invalid-input" };

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) return { ok: false, error: "not-found" };
    await saveRoomPhoto(room.id, file);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof PrivateImageError) return { ok: false, error: error.code };
    return { ok: false, error: "server-error" };
  }
}

export async function deleteRoomPhoto(
  roomId: number,
  filename: string
): Promise<RoomResult> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };
  if (!Number.isSafeInteger(roomId) || roomId <= 0) return { ok: false, error: "invalid-input" };

  try {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) return { ok: false, error: "not-found" };
    await deleteRoomPhotoFile(room.id, filename);
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof PrivateImageError) return { ok: false, error: error.code };
    return { ok: false, error: "server-error" };
  }
}
