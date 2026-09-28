import { connection } from "next/server";
import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth-session";
import type {
  EngHierarchySite,
  SerializedCertificate,
  SerializedCoolingAsset,
  SerializedPowerAsset,
  SerializedRoomSecurityRow,
} from "@/lib/cls";
import EngineeringClient from "./engineering-client";

export const instant = false;

export const metadata: Metadata = { title: "ระบบวิศวกรรม" };

const ISO = (d: Date | null): string | null =>
  d ? d.toISOString() : null;

export default async function EngineeringPage() {
  await connection();
  const session = await requireSession();

  const [assets, certs, rooms, sites] = await Promise.all([
    prisma.asset.findMany({
      orderBy: { code: "asc" },
      include: { floor: { include: { building: { include: { site: true } } } }, room: { select: { code: true } } },
    }),
    prisma.certificate.findMany({
      orderBy: { code: "asc" },
      include: { site: true },
    }),
    prisma.room.findMany({
      orderBy: { code: "asc" },
      include: { floor: { include: { building: { include: { site: true } } } }, security: true },
    }),
    prisma.site.findMany({
      orderBy: { code: "asc" },
      include: {
        buildings: {
          orderBy: { code: "asc" },
          include: {
            floors: {
              orderBy: { level: "asc" },
              include: { rooms: { orderBy: { no: "asc" }, select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
    }),
  ]);

  const user = await prisma.user
    .findUnique({ where: { id: session.user.id }, select: { role: true } })
    .catch(() => null);
  const canEdit = user?.role === "ADMIN" || user?.role === "EDITOR";

  const hierarchy: EngHierarchySite[] = sites.map((s) => {
    const buildings = new Map<
      number,
      { id: number; code: string; name: string; floors: (typeof s.buildings)[number]["floors"][number][] }
    >();
    for (const b of s.buildings) {
      for (const f of b.floors) {
        const group = buildings.get(b.id) ?? { id: b.id, code: b.code, name: b.name, floors: [] };
        group.floors.push(f);
        buildings.set(b.id, group);
      }
    }
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      buildings: [...buildings.values()].map((b) => ({
        id: b.id,
        code: b.code,
        name: b.name,
        floors: b.floors.map((f) => ({
          id: f.id,
          code: f.code,
          label: f.label,
          level: f.level,
          rooms: f.rooms.map((r) => ({ id: r.id, code: r.code, name: r.name })),
        })),
      })),
    };
  });

  const power: SerializedPowerAsset[] = assets
    .filter((a) => a.category === "POWER")
    .map((a) => ({
      id: a.id,
      code: a.code,
      legacyCode: a.legacyCode,
      name: a.name,
      brand: a.brand,
      model: a.model,
      status: a.status,
      note: a.note,
      specType: (a.specs as { type?: string | null } | null)?.type ?? null,
      capacity: (a.specs as { capacity?: string | null } | null)?.capacity ?? null,
      load: (a.specs as { load?: string | null } | null)?.load ?? null,
      floorId: a.floorId,
      roomId: a.roomId,
      siteCode: a.floor?.building.site.code ?? a.room?.code?.split("-")[0] ?? null,
      buildingCode: a.floor?.building.code ?? null,
      floorCode: a.floor?.code ?? null,
      floorLabel: a.floor?.label ?? null,
      roomCode: a.room?.code ?? null,
    }));

  const cooling: SerializedCoolingAsset[] = assets
    .filter((a) => a.category === "COOLING")
    .map((a) => {
      const s = (a.specs ?? {}) as {
        type?: string | null;
        btu?: string | null;
        btuTotal?: number | null;
        unitsTotal?: number | null;
        unitsReady?: number | null;
        unitsDown?: number | null;
        efficiencyPct?: number | null;
      };
      return {
        id: a.id,
        code: a.code,
        legacyCode: a.legacyCode,
        name: a.name,
        model: a.model,
        specType: s.type ?? null,
        note: a.note,
        btu: s.btu ?? null,
        btuTotal: s.btuTotal ?? null,
        unitsTotal: s.unitsTotal ?? null,
        unitsReady: s.unitsReady ?? null,
        unitsDown: s.unitsDown ?? null,
        efficiencyPct: s.efficiencyPct ?? null,
        roomId: a.roomId,
        siteCode: a.floor?.building.site.code ?? a.room?.code?.split("-")[0] ?? null,
        roomCode: a.room?.code ?? null,
      };
    });

  const certificates: SerializedCertificate[] = certs.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    scope: c.scope,
    issuer: c.issuer,
    certNo: c.certNo,
    issuedAt: ISO(c.issuedAt),
    expiresAt: ISO(c.expiresAt),
    detail: c.detail,
    siteId: c.siteId,
    siteCode: c.site.code,
    siteName: c.site.name,
    buildingCode: c.buildingCode,
    roomCode: c.roomCode,
  }));

  const securityRows: SerializedRoomSecurityRow[] = rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      siteCode: r.floor.building.site.code,
      floorLabel: r.floor.label,
      cctvCount: r.security?.cctvCount ?? null,
      accessControl: r.security?.accessControl ?? null,
      fireSuppression: r.security?.fireSuppression ?? null,
      vesda: r.security?.vesda ?? null,
    }));

  const totalPower = power.length;
  const totalCooling = cooling.length;
  const totalCerts = certificates.length;
  const totalSecurity = securityRows.length;

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">ระบบวิศวกรรม</h1>
        <p className="text-sm text-muted-foreground">
          ระบบไฟฟ้า (Power) · เครื่องปรับอากาศแม่นยำ (Precision AC) · ใบรับรองมาตรฐาน · ความปลอดภัยของห้อง
        </p>
      </div>
      <EngineeringClient
        power={power}
        cooling={cooling}
        certificates={certificates}
        security={securityRows}
        totals={{ power: totalPower, cooling: totalCooling, certs: totalCerts, security: totalSecurity }}
        canEdit={canEdit}
        hierarchy={hierarchy}
      />
    </div>
  );
}
