import { connection } from "next/server";
import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { requireSession } from "@/lib/auth-session";
import { listRoomPhotos } from "@/lib/private-images";
import type {
  CoolingSpec,
  RoomStatus,
  SecurityData,
  SerializedRoom,
} from "@/lib/cls";
import RoomsClient from "./rooms-client";

export const instant = false;

export const metadata: Metadata = { title: "ห้องทั้งหมด" };

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const session = await requireSession();
  const params = await searchParams;
  const initialSite = typeof params.site === "string" ? params.site : "";
  const initialBuilding = typeof params.building === "string" ? params.building : "";
  const initialFloor = typeof params.floor === "string" ? params.floor : "";

  const rooms = await prisma.room.findMany({
    orderBy: { code: "asc" },
    include: {
      floor: { include: { building: { include: { site: true } } } },
      security: true,
      assets: { where: { category: "COOLING" }, orderBy: { code: "asc" } },
    },
  });

  const user = await prisma.user
    .findUnique({ where: { id: session.user.id }, select: { role: true } })
    .catch(() => null);
  const canEdit = user?.role === "ADMIN" || user?.role === "EDITOR";

  const photos = await Promise.all(rooms.map((room) => listRoomPhotos(room.id)));
  const serialized: SerializedRoom[] = rooms.map((r, index) => ({
    id: r.id,
    code: r.code,
    no: r.no,
    name: r.name,
    status: r.status as RoomStatus,
    areaSqm: r.areaSqm,
    ceilingHeightM: r.ceilingHeightM,
    raisedFloorCm: r.raisedFloorCm,
    floorLoadKgm2: r.floorLoadKgm2,
    tenant: r.tenant,
    floorCode: r.floor.code,
    floorLabel: r.floor.label,
    level: r.floor.level,
    buildingCode: r.floor.building.code,
    buildingName: r.floor.building.name,
    siteCode: r.floor.building.site.code,
    siteName: r.floor.building.site.name,
    security: r.security
      ? ({
          cctvCount: r.security.cctvCount,
          accessControl: r.security.accessControl,
          fireSuppression: r.security.fireSuppression,
          vesda: r.security.vesda,
        } satisfies SecurityData)
      : null,
    cooling: r.assets.map((a) => ({
      code: a.code,
      name: a.name,
      model: a.model,
      specs: (a.specs ?? {}) as CoolingSpec,
    })),
    photos: photos[index],
  }));

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">ห้องทั้งหมด</h1>
        <p className="text-sm text-muted-foreground">
          รายการห้องทุกสถานี — ค้นหา กรองสถานะ และดูข้อมูล 360° ของแต่ละห้อง
        </p>
      </div>
      <RoomsClient
        rooms={serialized}
        initialSite={initialSite}
        initialBuilding={initialBuilding}
        initialFloor={initialFloor}
        canEdit={canEdit}
      />
    </div>
  );
}
