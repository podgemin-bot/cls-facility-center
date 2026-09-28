"use server"

import { headers } from "next/headers"
import { refresh } from "next/cache"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"

export type AssetCategory = "POWER" | "COOLING"

export type EngResult = { ok: boolean; error?: string }

const SCOPES = ["STATION", "BUILDING", "FLOOR", "ROOM"] as const

const pad3 = (n: number) => String(n).padStart(3, "0")

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

const toNum = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const toDate = (v: unknown): Date | null => {
  if (v === "" || v === null || v === undefined) return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

const strOrNull = (v: unknown): string | null => {
  if (v === "" || v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

// ==================== ASSET ====================

export type AssetInput = {
  category: AssetCategory
  name: string
  brand: string
  model: string
  status: string
  note: string
  floorId: string
  roomId: string
  specType: string
  capacity: string
  load: string
  btu: string
  btuTotal: string
  unitsTotal: string
  unitsReady: string
  unitsDown: string
  efficiencyPct: string
}

const ASSET_CODE_RE = /^\d+$/

async function nextAssetCode(category: AssetCategory, siteCode: string): Promise<string> {
  const prefix = category === "POWER" ? "PWR" : "COOL"
  const assets = await prisma.asset.findMany({
    where: { category, code: { startsWith: `${prefix}-${siteCode}-` } },
    select: { code: true },
  })
  let max = 0
  for (const a of assets) {
    const m = a.code.match(/-(\d+)$/)
    if (m && ASSET_CODE_RE.test(m[1])) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefix}-${siteCode}-${pad3(max + 1)}`
}

function buildAssetData(input: AssetInput, code: string) {
  const floorId = toNum(input.floorId)
  const roomId = toNum(input.roomId)
  const cooling = input.category === "COOLING"
  return {
    category: input.category,
    code,
    name: input.name.trim(),
    brand: strOrNull(input.brand),
    model: strOrNull(input.model),
    status: strOrNull(input.status),
    note: strOrNull(input.note),
    floorId: floorId ?? (roomId ? undefined : null),
    roomId,
    specs: cooling
      ? {
          type: strOrNull(input.specType),
          btu: strOrNull(input.btu),
          btuTotal: toNum(input.btuTotal),
          unitsTotal: toNum(input.unitsTotal),
          unitsReady: toNum(input.unitsReady),
          unitsDown: toNum(input.unitsDown),
          efficiencyPct: toNum(input.efficiencyPct),
        }
      : {
          type: strOrNull(input.specType),
          capacity: strOrNull(input.capacity),
          load: strOrNull(input.load),
        },
  }
}

async function assetSiteCode(input: AssetInput): Promise<string | null> {
  const roomId = toNum(input.roomId)
  if (roomId) {
    const r = await prisma.room.findUnique({
      where: { id: roomId },
      include: { floor: { include: { building: { include: { site: true } } } } },
    })
    return r?.floor.building.site.code ?? null
  }
  const floorId = toNum(input.floorId)
  if (!floorId) return null
  const f = await prisma.floor.findUnique({
    where: { id: floorId },
    include: { building: { include: { site: true } } },
  })
  return f?.building.site.code ?? null
}

export async function resolveNextAssetCode(
  category: AssetCategory,
  siteCode: string
): Promise<string | null> {
  const denied = await requireEditor()
  if (denied) return null
  if (!siteCode) return null
  return nextAssetCode(category, siteCode)
}

export async function createAsset(input: AssetInput): Promise<EngResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "invalid-input" }
  if (input.category !== "POWER" && input.category !== "COOLING")
    return { ok: false, error: "invalid-input" }

  const siteCode = await assetSiteCode(input)
  if (!siteCode) return { ok: false, error: "invalid-input" }

  try {
    const code = await nextAssetCode(input.category, siteCode)
    await prisma.asset.create({ data: buildAssetData(input, code) })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function updateAsset(id: number, input: AssetInput): Promise<EngResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid-input" }
  const name = input.name.trim()
  if (!name) return { ok: false, error: "invalid-input" }

  try {
    const existing = await prisma.asset.findUnique({ where: { id } })
    if (!existing) return { ok: false, error: "not-found" }
    await prisma.asset.update({ where: { id }, data: buildAssetData(input, existing.code) })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function deleteAsset(id: number): Promise<EngResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid-input" }

  try {
    const existing = await prisma.asset.findUnique({ where: { id } })
    if (!existing) return { ok: false, error: "not-found" }
    await prisma.asset.delete({ where: { id } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

// ==================== CERTIFICATE ====================

export type CertInput = {
  code: string
  name: string
  scope: string
  siteId: string
  issuer: string
  certNo: string
  issuedAt: string
  expiresAt: string
  detail: string
  buildingCode: string
  roomCode: string
}

function buildCertData(input: CertInput, siteId: number) {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    scope: input.scope,
    siteId,
    issuer: strOrNull(input.issuer),
    certNo: strOrNull(input.certNo),
    issuedAt: toDate(input.issuedAt),
    expiresAt: toDate(input.expiresAt),
    detail: strOrNull(input.detail),
    buildingCode: strOrNull(input.buildingCode),
    roomCode: strOrNull(input.roomCode),
  }
}

export async function createCertificate(input: CertInput): Promise<EngResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const code = input.code.trim()
  const name = input.name.trim()
  const siteId = toNum(input.siteId)
  if (!code || !name) return { ok: false, error: "invalid-input" }
  if (!(SCOPES as readonly string[]).includes(input.scope)) return { ok: false, error: "invalid-input" }
  if (!siteId) return { ok: false, error: "invalid-input" }

  try {
    const exists = await prisma.certificate.findUnique({ where: { code } })
    if (exists) return { ok: false, error: "duplicate-code" }
    await prisma.certificate.create({ data: buildCertData(input, siteId) })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function updateCertificate(id: number, input: CertInput): Promise<EngResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid-input" }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "invalid-input" }
  if (!(SCOPES as readonly string[]).includes(input.scope)) return { ok: false, error: "invalid-input" }
  if (!toNum(input.siteId)) return { ok: false, error: "invalid-input" }

  try {
    const existing = await prisma.certificate.findUnique({ where: { id } })
    if (!existing) return { ok: false, error: "not-found" }
    const code = input.code.trim() || existing.code
    if (code !== existing.code) {
      const dup = await prisma.certificate.findUnique({ where: { code } })
      if (dup) return { ok: false, error: "duplicate-code" }
    }
    const siteId = toNum(input.siteId)!
    await prisma.certificate.update({ where: { id }, data: { ...buildCertData(input, siteId), code } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function deleteCertificate(id: number): Promise<EngResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "invalid-input" }

  try {
    const existing = await prisma.certificate.findUnique({ where: { id } })
    if (!existing) return { ok: false, error: "not-found" }
    await prisma.certificate.delete({ where: { id } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}