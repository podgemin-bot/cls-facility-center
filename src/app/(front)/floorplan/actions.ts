"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

export type SavePinResult = { ok: boolean; error?: string };

const pad = (n: number, w: number) => String(n).padStart(w, "0");

async function requireEditor(): Promise<string | null> {
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
  if (!user || (user.role !== "ADMIN" && user.role !== "EDITOR")) {
    return "forbidden";
  }
  return null;
}

export async function savePin(
  roomId: number,
  x: number,
  y: number
): Promise<SavePinResult> {
  const denied = await requireEditor();
  if (denied) return { ok: false, error: denied };

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 100 ||
    y < 0 ||
    y > 100
  ) {
    return { ok: false, error: "invalid-coordinates" };
  }

  try {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        floor: { include: { building: true } },
        photoPoints: { orderBy: { seqOnFloor: "asc" }, take: 1 },
      },
    });
    if (!room) return { ok: false, error: "room-not-found" };

    const existing = room.photoPoints[0];
    if (existing) {
      await prisma.photoPoint.update({
        where: { id: existing.id },
        data: { x, y },
      });
    } else {
      const agg = await prisma.photoPoint.aggregate({
        where: { room: { floorId: room.floorId } },
        _max: { seqOnFloor: true },
      });
      const seq = (agg._max.seqOnFloor ?? 0) + 1;
      await prisma.photoPoint.create({
        data: {
          roomId,
          code: `PT-${room.floor.building.code}-F${pad(room.floor.level, 2)}-${pad(seq, 3)}`,
          seqOnFloor: seq,
          x,
          y,
        },
      });
    }

    refresh();
    return { ok: true };
  } catch {
    return { ok: false, error: "server-error" };
  }
}
