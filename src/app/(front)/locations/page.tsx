import { connection } from "next/server"
import prisma from "@/lib/prisma"
import { requireSession } from "@/lib/auth-session"
import { floorPlanUrl } from "@/lib/private-images"
import {
  type SerializedSite,
  type SerializedBuilding,
  type SerializedFloor,
  type SerializedLocationRoom,
} from "@/lib/cls"
import LocationsClient from "./locations-client"

export const instant = false

export default async function LocationsPage() {
  await connection()
  const session = await requireSession()

  const user = await prisma.user
    .findUnique({ where: { id: session.user.id }, select: { role: true } })
    .catch(() => null)
  const canEdit = user?.role === "ADMIN" || user?.role === "EDITOR"

  const sites = await prisma.site.findMany({
    orderBy: { code: "asc" },
    include: {
      _count: { select: { buildings: true } },
      buildings: {
        orderBy: { code: "asc" },
        include: {
          _count: { select: { floors: true } },
          floors: {
            orderBy: { level: "asc" },
            include: { _count: { select: { rooms: true } } },
          },
        },
      },
    },
  })

  const serializedSites: SerializedSite[] = sites.map((s) => {
    let floorCount = 0
    let roomCount = 0
    for (const b of s.buildings) {
      floorCount += b._count.floors
      for (const f of b.floors) roomCount += f._count.rooms
    }
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      province: s.province,
      lat: s.lat,
      lng: s.lng,
      buildingCount: s._count.buildings,
      floorCount,
      roomCount,
    }
  })

  const serializedBuildings: SerializedBuilding[] = sites.flatMap((s) =>
    s.buildings.map((b) => {
      let roomCount = 0
      for (const f of b.floors) roomCount += f._count.rooms
      return {
        id: b.id,
        code: b.code,
        name: b.name,
        siteCode: s.code,
        siteName: s.name,
        floorCount: b._count.floors,
        roomCount,
      }
    })
  )

  const serializedFloors: SerializedFloor[] = sites.flatMap((s) =>
    s.buildings.flatMap((b) =>
      b.floors.map((f) => ({
        id: f.id,
        code: f.code,
        level: f.level,
        label: f.label,
        planImage: floorPlanUrl(f.id, f.planImage),
        buildingCode: b.code,
        buildingName: b.name,
        siteCode: s.code,
        roomCount: f._count.rooms,
      }))
    )
  )

  const serializedRooms = await prisma.room.findMany({
    orderBy: { code: "asc" },
    include: {
      floor: { include: { building: { include: { site: true } } } },
    },
  })
  const serializedRoomRows: SerializedLocationRoom[] = serializedRooms.map((r) => ({
    id: r.id,
    code: r.code,
    no: r.no,
    name: r.name,
    status: r.status,
    areaSqm: r.areaSqm,
    tenant: r.tenant,
    floorCode: r.floor.code,
    floorLabel: r.floor.label,
  }))

  return (
    <LocationsClient
      sites={serializedSites}
      buildings={serializedBuildings}
      floors={serializedFloors}
      rooms={serializedRoomRows}
      canEdit={canEdit}
    />
  )
}
