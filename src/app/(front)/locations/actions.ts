"use server"

import { headers } from "next/headers"
import { refresh } from "next/cache"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import type { RoomStatus } from "@/lib/cls"
import { deleteFloorPlanDirectory, deleteRoomPhotoDirectory } from "@/lib/private-images"

export type LocationResult = { ok: boolean; error?: string }

const STATUSES: RoomStatus[] = ["VACANT", "OCCUPIED", "MAINTENANCE", "RESERVED"]

async function requireEditor(): Promise<string | null> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null)
  if (!session?.user?.id) return "unauthorized"
  const user = await prisma.user
    .findUnique({ where: { id: session.user.id }, select: { role: true } })
    .catch(() => null)
  if (!user || (user.role !== "ADMIN" && user.role !== "EDITOR")) return "forbidden"
  return null
}

const pad2 = (n: number) => String(n).padStart(2, "0")

const CODE_SITE_RE = /^[A-Za-z0-9_-]{1,10}$/

async function nextBuildingNo(siteId: number): Promise<number | null> {
  const buildings = await prisma.building.findMany({
    where: { siteId },
    select: { code: true },
  })
  let max = 0
  for (const b of buildings) {
    const m = b.code.match(/B(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max ? max + 1 : 1
}

const toNum = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

async function cleanupPrivateStorage(roomIds: number[], floorIds: number[]) {
  const results = await Promise.allSettled([
    ...roomIds.map((id) => deleteRoomPhotoDirectory(id)),
    ...floorIds.map((id) => deleteFloorPlanDirectory(id)),
  ])
  for (const result of results) {
    if (result.status === "rejected") console.error("Private storage cleanup failed", result.reason)
  }
}

// ==================== SITE ====================

export type SiteInput = {
  code: string
  name: string
  province: string
  lat: string
  lng: string
}

export async function createSite(input: SiteInput): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const code = input.code.trim().toUpperCase()
  const name = input.name.trim()
  const province = input.province.trim()
  if (!code || !CODE_SITE_RE.test(code)) return { ok: false, error: "invalid-site-code" }
  if (!name) return { ok: false, error: "invalid-input" }
  if (!province) return { ok: false, error: "invalid-input" }

  try {
    const exists = await prisma.site.findUnique({ where: { code } })
    if (exists) return { ok: false, error: "duplicate-code" }
    await prisma.site.create({
      data: {
        code,
        name,
        province,
        lat: toNum(input.lat),
        lng: toNum(input.lng),
      },
    })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function updateSite(id: number, input: SiteInput): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const name = input.name.trim()
  const province = input.province.trim()
  if (!name || !province) return { ok: false, error: "invalid-input" }

  try {
    const site = await prisma.site.findUnique({ where: { id } })
    if (!site) return { ok: false, error: "not-found" }

    await prisma.site.update({
      where: { id },
      data: {
        name,
        province,
        lat: toNum(input.lat),
        lng: toNum(input.lng),
      },
    })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function deleteSite(id: number): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  try {
    const site = await prisma.site.findUnique({
      where: { id },
      include: { buildings: { include: { floors: { include: { rooms: { select: { id: true } } } } } } },
    })
    if (!site) return { ok: false, error: "not-found" }

    const roomIds: number[] = []
    const floorIds: number[] = []
    const buildingIds: number[] = []
    for (const b of site.buildings) {
      buildingIds.push(b.id)
      for (const f of b.floors) {
        floorIds.push(f.id)
        for (const r of f.rooms) roomIds.push(r.id)
      }
    }

    if (roomIds.length) {
      await prisma.asset.deleteMany({ where: { roomId: { in: roomIds } } })
    }
    if (floorIds.length) {
      await prisma.asset.deleteMany({ where: { floorId: { in: floorIds } } })
    }
    if (roomIds.length) {
      await prisma.photoPoint.deleteMany({ where: { roomId: { in: roomIds } } })
      await prisma.roomSecurity.deleteMany({ where: { roomId: { in: roomIds } } })
    }
    if (floorIds.length) await prisma.room.deleteMany({ where: { floorId: { in: floorIds } } })
    if (buildingIds.length) await prisma.floor.deleteMany({ where: { buildingId: { in: buildingIds } } })
    await prisma.building.deleteMany({ where: { siteId: id } })
    await prisma.certificate.deleteMany({ where: { siteId: id } })
    await prisma.site.delete({ where: { id } })
    await cleanupPrivateStorage(roomIds, floorIds)

    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

// ==================== BUILDING ====================

export type BuildingInput = {
  siteId: number
  name: string
}

export async function createBuilding(input: BuildingInput): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "invalid-input" }

  try {
    const site = await prisma.site.findUnique({ where: { id: input.siteId } })
    if (!site) return { ok: false, error: "not-found" }

    const no = await nextBuildingNo(site.id)
    if (!no) return { ok: false, error: "server-error" }
    const code = `${site.code}-B${pad2(no)}`

    await prisma.building.create({ data: { siteId: site.id, name, code } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function updateBuilding(id: number, name: string): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: "invalid-input" }

  try {
    const building = await prisma.building.findUnique({ where: { id } })
    if (!building) return { ok: false, error: "not-found" }
    await prisma.building.update({ where: { id }, data: { name: trimmed } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function deleteBuilding(id: number): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  try {
    const building = await prisma.building.findUnique({
      where: { id },
      include: { floors: { include: { rooms: { select: { id: true } } } } },
    })
    if (!building) return { ok: false, error: "not-found" }

    const roomIds: number[] = []
    const floorIds = building.floors.map((f) => f.id)
    for (const f of building.floors) for (const r of f.rooms) roomIds.push(r.id)

    if (floorIds.length) {
      if (roomIds.length) {
        await prisma.asset.deleteMany({ where: { roomId: { in: roomIds } } })
        await prisma.photoPoint.deleteMany({ where: { roomId: { in: roomIds } } })
        await prisma.roomSecurity.deleteMany({ where: { roomId: { in: roomIds } } })
      }
      await prisma.asset.deleteMany({ where: { floorId: { in: floorIds } } })
      await prisma.room.deleteMany({ where: { floorId: { in: floorIds } } })
      await prisma.floor.deleteMany({ where: { buildingId: id } })
    }
    await prisma.building.delete({ where: { id } })
    await cleanupPrivateStorage(roomIds, floorIds)

    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

// ==================== FLOOR ====================

export type FloorInput = {
  buildingId: number
  level: string
  label: string
}

export async function createFloor(input: FloorInput): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const level = toNum(input.level)
  if (level === null) return { ok: false, error: "invalid-input" }
  const label = input.label.trim()
  if (!label) return { ok: false, error: "invalid-input" }

  try {
    const building = await prisma.building.findUnique({ where: { id: input.buildingId } })
    if (!building) return { ok: false, error: "not-found" }

    const dupLevel = await prisma.floor.findUnique({
      where: { buildingId_level: { buildingId: building.id, level } },
    })
    if (dupLevel) return { ok: false, error: "duplicate-level" }

    const code = `${building.code}-F${pad2(level)}`
    await prisma.floor.create({ data: { buildingId: building.id, level, label, code } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function updateFloor(id: number, input: FloorInput): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const level = toNum(input.level)
  if (level === null) return { ok: false, error: "invalid-input" }
  const label = input.label.trim()
  if (!label) return { ok: false, error: "invalid-input" }

  try {
    const floor = await prisma.floor.findUnique({ where: { id } })
    if (!floor) return { ok: false, error: "not-found" }

    const dupLevel = await prisma.floor.findUnique({
      where: { buildingId_level: { buildingId: floor.buildingId, level } },
    })
    if (dupLevel && dupLevel.id !== id) return { ok: false, error: "duplicate-level" }

    const building = await prisma.building.findUnique({ where: { id: floor.buildingId } })
    if (!building) return { ok: false, error: "not-found" }

    const code = `${building.code}-F${pad2(level)}`
    await prisma.floor.update({
      where: { id },
      data: { level, label, code },
    })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function deleteFloor(id: number): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  try {
    const floor = await prisma.floor.findUnique({
      where: { id },
      include: { rooms: { select: { code: true, id: true } } },
    })
    if (!floor) return { ok: false, error: "not-found" }

    const roomIds = floor.rooms.map((r) => r.id)

    if (roomIds.length) {
      await prisma.asset.deleteMany({ where: { roomId: { in: roomIds } } })
      await prisma.photoPoint.deleteMany({ where: { roomId: { in: roomIds } } })
      await prisma.roomSecurity.deleteMany({ where: { roomId: { in: roomIds } } })
    }
    await prisma.asset.deleteMany({ where: { floorId: id } })
    await prisma.room.deleteMany({ where: { floorId: id } })
    await prisma.floor.delete({ where: { id } })
    await cleanupPrivateStorage(roomIds, [id])

    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

// ==================== ROOM ====================

export type RoomInput = {
  floorId: number
  no: string
  name: string
  status: string
  areaSqm: string
  ceilingHeightM: string
  raisedFloorCm: string
  floorLoadKgm2: string
  tenant: string
}

export async function createRoom(input: RoomInput): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const no = toNum(input.no)
  if (no === null) return { ok: false, error: "invalid-input" }
  const name = input.name.trim()
  if (!name) return { ok: false, error: "invalid-input" }
  if (!STATUSES.includes(input.status as RoomStatus)) {
    return { ok: false, error: "invalid-input" }
  }

  try {
    const floor = await prisma.floor.findUnique({ where: { id: input.floorId } })
    if (!floor) return { ok: false, error: "not-found" }

    const code = `${floor.code}-R${pad2(no)}`
    await prisma.room.create({
      data: {
        floorId: floor.id,
        no,
        name,
        code,
        status: input.status as RoomStatus,
        areaSqm: toNum(input.areaSqm),
        ceilingHeightM: toNum(input.ceilingHeightM),
        raisedFloorCm: toNum(input.raisedFloorCm),
        floorLoadKgm2: toNum(input.floorLoadKgm2),
        tenant: input.tenant.trim() || null,
      },
    })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function updateRoom(id: number, input: RoomInput): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const no = toNum(input.no)
  if (no === null) return { ok: false, error: "invalid-input" }
  const name = input.name.trim()
  if (!name) return { ok: false, error: "invalid-input" }
  if (!STATUSES.includes(input.status as RoomStatus)) {
    return { ok: false, error: "invalid-input" }
  }

  try {
    const room = await prisma.room.findUnique({ where: { id } })
    if (!room) return { ok: false, error: "not-found" }
    const floor = await prisma.floor.findUnique({ where: { id: room.floorId } })
    if (!floor) return { ok: false, error: "not-found" }

    const code = `${floor.code}-R${pad2(no)}`
    await prisma.room.update({
      where: { id },
      data: {
        no,
        name,
        code,
        status: input.status as RoomStatus,
        areaSqm: toNum(input.areaSqm),
        ceilingHeightM: toNum(input.ceilingHeightM),
        raisedFloorCm: toNum(input.raisedFloorCm),
        floorLoadKgm2: toNum(input.floorLoadKgm2),
        tenant: input.tenant.trim() || null,
      },
    })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function deleteRoom(id: number): Promise<LocationResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  try {
    const room = await prisma.room.findUnique({ where: { id }, select: { id: true } })
    if (!room) return { ok: false, error: "not-found" }

    await prisma.asset.deleteMany({ where: { roomId: id } })
    await prisma.photoPoint.deleteMany({ where: { roomId: id } })
    await prisma.roomSecurity.deleteMany({ where: { roomId: id } })
    await prisma.room.delete({ where: { id } })
    await cleanupPrivateStorage([id], [])

    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}
