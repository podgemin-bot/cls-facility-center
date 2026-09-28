"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  STATUS_META,
  type RoomStatus,
  type SerializedSite,
  type SerializedBuilding,
  type SerializedFloor,
  type SerializedLocationRoom,
} from "@/lib/cls"
import {
  createSite,
  updateSite,
  deleteSite,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  createFloor,
  updateFloor,
  deleteFloor,
  createRoom,
  updateRoom,
  deleteRoom,
  type SiteInput,
  type BuildingInput,
  type FloorInput,
  type RoomInput,
} from "./actions"
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  DoorOpen,
  Layers,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Warehouse,
  X,
} from "lucide-react"

type Props = {
  sites: SerializedSite[]
  buildings: SerializedBuilding[]
  floors: SerializedFloor[]
  rooms: SerializedLocationRoom[]
  canEdit: boolean
}

const ERROR_LABEL: Record<string, string> = {
  unauthorized: "กรุณาเข้าสู่ระบบ",
  forbidden: "ต้องเป็น Admin/Editor เท่านั้น",
  "invalid-input": "ข้อมูลไม่ถูกต้อง",
  "invalid-site-code": "รหัสสถานีต้องเป็นตัวอักษร/ตัวเลขภาษาอังกฤษ ยาวไม่เกิน 10 ตัว",
  "duplicate-code": "รหัสนี้มีอยู่แล้วในระบบ",
  "duplicate-level": "ชั้นนี้มีอยู่แล้วในอาคารนี้",
  "not-found": "ไม่พบข้อมูล",
  "server-error": "เกิดข้อผิดพลาด กรุณาลองใหม่",
}

type Level = "sites" | "buildings" | "floors" | "rooms"

export default function LocationsClient({ sites, buildings, floors, rooms, canEdit }: Props) {
  const router = useRouter()
  const [siteId, setSiteId] = useState<number | null>(null)
  const [buildingId, setBuildingId] = useState<number | null>(null)
  const [floorId, setFloorId] = useState<number | null>(null)

  const [addSiteOpen, setAddSiteOpen] = useState(false)
  const [editSite, setEditSite] = useState<SerializedSite | null>(null)
  const [addBuildingSite, setAddBuildingSite] = useState<number | null>(null)
  const [editBuilding, setEditBuilding] = useState<SerializedBuilding | null>(null)
  const [addFloorBuilding, setAddFloorBuilding] = useState<number | null>(null)
  const [editFloor, setEditFloor] = useState<SerializedFloor | null>(null)
  const [addRoomFloor, setAddRoomFloor] = useState<number | null>(null)
  const [editRoom, setEditRoom] = useState<SerializedLocationRoom | null>(null)

  const selectedSite = sites.find((s) => s.id === siteId) ?? null
  const selectedBuilding = buildings.find((b) => b.id === buildingId) ?? null
  const selectedFloor = floors.find((f) => f.id === floorId) ?? null

  const siteBuildings = useMemo(
    () => (siteId ? buildings.filter((b) => b.siteCode === selectedSite?.code) : []),
    [siteId, buildings, selectedSite]
  )
  const buildingFloors = useMemo(
    () => (buildingId ? floors.filter((f) => f.buildingCode === selectedBuilding?.code) : []),
    [buildingId, floors, selectedBuilding]
  )
  const floorRooms = useMemo(
    () => (floorId ? rooms.filter((r) => r.floorCode === selectedFloor?.code) : []),
    [floorId, rooms, selectedFloor]
  )

  const level: Level = floorId ? "rooms" : buildingId ? "floors" : siteId ? "buildings" : "sites"

  const breadcrumb = (
    <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
      <button
        className="font-medium hover:text-foreground"
        onClick={() => {
          setSiteId(null)
          setBuildingId(null)
          setFloorId(null)
        }}
      >
        ทั้งหมด
      </button>
      {selectedSite && (
        <>
          <ChevronRight className="size-4" />
          <button
            className="font-medium hover:text-foreground"
            onClick={() => {
              setBuildingId(null)
              setFloorId(null)
            }}
          >
            {selectedSite.name}
          </button>
        </>
      )}
      {selectedBuilding && (
        <>
          <ChevronRight className="size-4" />
          <button
            className="font-medium hover:text-foreground"
            onClick={() => setFloorId(null)}
          >
            {selectedBuilding.code} · {selectedBuilding.name}
          </button>
        </>
      )}
      {selectedFloor && (
        <>
          <ChevronRight className="size-4" />
          <span className="font-semibold text-foreground">{selectedFloor.code}</span>
        </>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">สถานที่</h1>
        <p className="text-sm text-muted-foreground">
          จัดการสถานี อาคาร ชั้น และห้องในระบบ CLS Facility Center
        </p>
      </div>

      <div className="mb-5 flex items-center justify-between gap-3">
        {breadcrumb}
        {canEdit && level === "sites" && (
          <Button size="sm" onClick={() => setAddSiteOpen(true)}>
            <Plus data-icon="inline-start" />
            เพิ่มสถานี
          </Button>
        )}
        {canEdit && level === "buildings" && selectedSite && (
          <Button size="sm" onClick={() => setAddBuildingSite(selectedSite.id)}>
            <Plus data-icon="inline-start" />
            เพิ่มอาคาร
          </Button>
        )}
        {canEdit && level === "floors" && selectedBuilding && (
          <Button size="sm" onClick={() => setAddFloorBuilding(selectedBuilding.id)}>
            <Plus data-icon="inline-start" />
            เพิ่มชั้น
          </Button>
        )}
        {canEdit && level === "rooms" && selectedFloor && (
          <Button size="sm" onClick={() => setAddRoomFloor(selectedFloor.id)}>
            <Plus data-icon="inline-start" />
            เพิ่มห้อง
          </Button>
        )}
      </div>

      {level === "sites" && (
        <SitesView
          sites={sites}
          canEdit={canEdit}
          onOpen={(s) => {
            setSiteId(s.id)
            setBuildingId(null)
            setFloorId(null)
          }}
          onEdit={setEditSite}
          onDelete={(s) => confirmDelete(`สถานี ${s.name} และข้อมูลทั้งหมดใต้สถานีนี้`, () => doDeleteSite(s.id))}
        />
      )}

      {level === "buildings" && (
        <BuildingsView
          buildings={siteBuildings}
          canEdit={canEdit}
          onOpen={(b) => {
            setBuildingId(b.id)
            setFloorId(null)
          }}
          onBack={() => setSiteId(null)}
          onEdit={setEditBuilding}
          onDelete={(b) => confirmDelete(`อาคาร ${b.code} และข้อมูลทั้งหมดใต้ชั้นนี้`, () => doDeleteBuilding(b.id))}
        />
      )}

      {level === "floors" && (
        <FloorsView
          floors={buildingFloors}
          canEdit={canEdit}
          onOpen={(f) => setFloorId(f.id)}
          onBack={() => setBuildingId(null)}
          onEdit={setEditFloor}
          onDelete={(f) => confirmDelete(`ชั้น ${f.code} และห้องทั้งหมดในชั้นนี้`, () => doDeleteFloor(f.id))}
        />
      )}

      {level === "rooms" && (
        <RoomsView
          rooms={floorRooms}
          floor={selectedFloor!}
          canEdit={canEdit}
          onBack={() => setFloorId(null)}
          onEdit={setEditRoom}
          onDelete={(r) => confirmDelete(`ห้อง ${r.code}`, () => doDeleteRoom(r.id))}
        />
      )}

      {addSiteOpen && (
        <SiteDialog
          open={addSiteOpen}
          onClose={() => setAddSiteOpen(false)}
          onSave={doCreateSite}
        />
      )}
      {editSite && (
        <SiteDialog open={!!editSite} site={editSite} onClose={() => setEditSite(null)} onSave={doUpdateSite} />
      )}
      {addBuildingSite !== null && (
        <BuildingDialog
          open={addBuildingSite !== null}
          siteId={addBuildingSite}
          siteCode={sites.find((s) => s.id === addBuildingSite)?.code ?? ""}
          onClose={() => setAddBuildingSite(null)}
          onSave={doCreateBuilding}
        />
      )}
      {editBuilding && (
        <BuildingDialog open={!!editBuilding} building={editBuilding} siteId={editBuilding ? sites.find((s) => s.code === editBuilding.siteCode)?.id ?? 0 : 0} siteCode={editBuilding.siteCode} onClose={() => setEditBuilding(null)} onSave={doUpdateBuilding} />
      )}
      {addFloorBuilding !== null && (
        <FloorDialog
          open={addFloorBuilding !== null}
          buildingId={addFloorBuilding}
          buildingCode={buildings.find((b) => b.id === addFloorBuilding)?.code ?? ""}
          onClose={() => setAddFloorBuilding(null)}
          onSave={doCreateFloor}
        />
      )}
      {editFloor && (
        <FloorDialog open={!!editFloor} floor={editFloor} buildingId={editFloor ? buildings.find((b) => b.code === editFloor.buildingCode)?.id ?? 0 : 0} buildingCode={editFloor.buildingCode} onClose={() => setEditFloor(null)} onSave={doUpdateFloor} />
      )}
      {addRoomFloor !== null && (
        <RoomDialog
          open={addRoomFloor !== null}
          floorId={addRoomFloor}
          floorCode={floors.find((f) => f.id === addRoomFloor)?.code ?? ""}
          onClose={() => setAddRoomFloor(null)}
          onSave={doCreateRoom}
        />
      )}
      {editRoom && (
        <RoomDialog
          open={!!editRoom}
          floorId={floors.find((f) => f.code === editRoom.floorCode)?.id ?? 0}
          room={editRoom}
          floorCode={editRoom.floorCode}
          onClose={() => setEditRoom(null)}
          onSave={doUpdateRoom}
        />
      )}
    </div>
  )

  function confirmDelete(detail: string, fn: () => void) {
    if (window.confirm(`ลบ${detail} แน่ใจหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`)) fn()
  }

  // Helper to run a server action and return an error label (or null)
  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>): Promise<string | null> {
    return fn().then((r) => {
      if (r.ok) router.refresh()
      return r.ok ? null : (r.error ?? "server-error")
    })
  }

  // ---- save handlers ----
  function doCreateSite(_id: number, input: SiteInput) {
    return runAction(async () => createSite(input))
  }
  function doUpdateSite(id: number, input: SiteInput) {
    return runAction(async () => updateSite(id, input))
  }
  function doDeleteSite(id: number) {
    return runAction(async () => deleteSite(id))
  }
  function doCreateBuilding(_id: number, input: BuildingInput) {
    return runAction(async () => createBuilding(input))
  }
  function doUpdateBuilding(id: number, input: BuildingInput) {
    return runAction(async () => updateBuilding(id, input.name))
  }
  function doDeleteBuilding(id: number) {
    return runAction(async () => deleteBuilding(id))
  }
  function doCreateFloor(_id: number, input: FloorInput) {
    return runAction(async () => createFloor(input))
  }
  function doUpdateFloor(id: number, input: FloorInput) {
    return runAction(async () => updateFloor(id, input))
  }
  function doDeleteFloor(id: number) {
    return runAction(async () => deleteFloor(id))
  }
  function doCreateRoom(_id: number, input: RoomInput) {
    return runAction(async () => createRoom(input))
  }
  function doUpdateRoom(id: number, input: RoomInput) {
    return runAction(async () => updateRoom(id, input))
  }
  function doDeleteRoom(id: number) {
    return runAction(async () => deleteRoom(id))
  }
}

// ==================== SITES VIEW ====================

function SitesView({
  sites,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
}: {
  sites: SerializedSite[]
  canEdit: boolean
  onOpen: (s: SerializedSite) => void
  onEdit: (s: SerializedSite) => void
  onDelete: (s: SerializedSite) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sites.map((s) => (
          <button
            key={s.id}
            onClick={() => onOpen(s)}
            className="group text-left"
          >
            <div className="rounded-xl border bg-gradient-to-br from-sky-600 to-cyan-500 p-5 text-white shadow-sm transition-shadow group-hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="text-xs opacity-80">{s.code}</div>
                <MapPin className="size-4 opacity-70" />
              </div>
              <div className="mt-1 text-lg font-bold">{s.name}</div>
              <div className="text-xs opacity-90">จ.{s.province}</div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Cell icon={<Warehouse className="size-4" />} label="อาคาร" value={s.buildingCount} />
                <Cell icon={<Layers className="size-4" />} label="ชั้น" value={s.floorCount} />
                <Cell icon={<DoorOpen className="size-4" />} label="ห้อง" value={s.roomCount} />
              </div>
              <div className="mt-4 flex items-center justify-end text-xs font-medium opacity-80 group-hover:opacity-100">
                ดูรายละเอียด <ChevronRight className="size-3.5" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {canEdit && (
        <TableShell
          cols={["รหัส", "ชื่อสถานี", "จังหวัด", "อาคาร", "ชั้น", "ห้อง", ""]}
          rows={sites.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs font-medium">{s.code}</TableCell>
              <TableCell data-card-title className="font-medium" onClick={() => onOpen(s)}>
                <span className="cursor-pointer">{s.name}</span>
              </TableCell>
              <TableCell>{s.province}</TableCell>
              <TableCell>{s.buildingCount}</TableCell>
              <TableCell>{s.floorCount}</TableCell>
              <TableCell>{s.roomCount}</TableCell>
              <TableCell>
                <RowActions
                  onEdit={() => onEdit(s)}
                  onDelete={() => onDelete(s)}
                />
              </TableCell>
            </TableRow>
          ))}
        />
      )}
    </div>
  )
}

// ==================== BUILDINGS VIEW ====================

function BuildingsView({
  buildings,
  canEdit,
  onOpen,
  onBack,
  onEdit,
  onDelete,
}: {
  buildings: SerializedBuilding[]
  canEdit: boolean
  onOpen: (b: SerializedBuilding) => void
  onBack: () => void
  onEdit: (b: SerializedBuilding) => void
  onDelete: (b: SerializedBuilding) => void
}) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        กลับ
      </Button>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {buildings.map((b) => (
          <button key={b.id} onClick={() => onOpen(b)} className="group text-left">
            <div className="rounded-xl border p-5 shadow-sm transition-shadow group-hover:shadow-md">
              <div className="flex items-center justify-between">
                <Building2 className="size-5 text-sky-600" />
                <div className="font-mono text-xs text-muted-foreground">{b.code}</div>
              </div>
              <div className="mt-2 text-lg font-bold">{b.name}</div>
              <div className="text-xs text-muted-foreground">{b.siteName}</div>
              <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
                <span>{b.floorCount} ชั้น</span>
                <span>{b.roomCount} ห้อง</span>
              </div>
              <div className="mt-4 flex items-center justify-end text-xs font-medium text-sky-600 opacity-80 group-hover:opacity-100">
                ดูชั้น <ChevronRight className="size-3.5" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {canEdit && (
        <TableShell
          cols={["รหัส", "ชื่ออาคาร", "ชั้น", "ห้อง", ""]}
          rows={buildings.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-xs font-medium">{b.code}</TableCell>
              <TableCell data-card-title className="font-medium">{b.name}</TableCell>
              <TableCell>{b.floorCount}</TableCell>
              <TableCell>{b.roomCount}</TableCell>
              <TableCell>
                <RowActions onEdit={() => onEdit(b)} onDelete={() => onDelete(b)} />
              </TableCell>
            </TableRow>
          ))}
        />
      )}
    </div>
  )
}

// ==================== FLOORS VIEW ====================

function FloorsView({
  floors,
  canEdit,
  onOpen,
  onBack,
  onEdit,
  onDelete,
}: {
  floors: SerializedFloor[]
  canEdit: boolean
  onOpen: (f: SerializedFloor) => void
  onBack: () => void
  onEdit: (f: SerializedFloor) => void
  onDelete: (f: SerializedFloor) => void
}) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft data-icon="inline-start" />
        กลับ
      </Button>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {floors.map((f) => (
          <button key={f.id} onClick={() => onOpen(f)} className="group text-left">
            <div className="rounded-xl border p-5 shadow-sm transition-shadow group-hover:shadow-md">
              <div className="flex items-center justify-between">
                <Layers className="size-5 text-sky-600" />
                <div className="font-mono text-xs text-muted-foreground">{f.code}</div>
              </div>
              <div className="mt-2 text-lg font-bold">{f.label}</div>
              <div className="text-xs text-muted-foreground">ชั้น {f.level} · {f.buildingName}</div>
              <div className="flex items-center justify-between">
                <span className="mt-4 text-sm text-muted-foreground">{f.roomCount} ห้อง</span>
                <span className="mt-4 text-xs font-medium text-sky-600 opacity-80 group-hover:opacity-100">
                  ดูห้อง <ChevronRight className="inline size-3.5" />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {canEdit && (
        <TableShell
          cols={["รหัส", "ระดับชั้น", "ชื่อ/ป้าย", "จำนวนห้อง", ""]}
          rows={floors.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-mono text-xs font-medium">{f.code}</TableCell>
              <TableCell>{f.level}</TableCell>
              <TableCell data-card-title className="font-medium">{f.label}</TableCell>
              <TableCell>{f.roomCount}</TableCell>
              <TableCell>
                <RowActions onEdit={() => onEdit(f)} onDelete={() => onDelete(f)} />
              </TableCell>
            </TableRow>
          ))}
        />
      )}
    </div>
  )
}

// ==================== ROOMS VIEW ====================

function RoomsView({
  rooms,
  floor,
  canEdit,
  onBack,
  onEdit,
  onDelete,
}: {
  rooms: SerializedLocationRoom[]
  floor: SerializedFloor
  canEdit: boolean
  onBack: () => void
  onEdit: (r: SerializedLocationRoom) => void
  onDelete: (r: SerializedLocationRoom) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft data-icon="inline-start" />
          กลับ
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/rooms?floor=${floor.code}`}>
            ไปหน้าห้องทั้งหมด
            <ChevronRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <TableShell
        cols={["รหัสห้อง", "ลำดับ", "ชื่อห้อง", "พื้นที่ (ตร.ม.)", "สถานะ", canEdit ? "" : undefined]}
        rows={rooms.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs font-medium">{r.code}</TableCell>
            <TableCell>{r.no}</TableCell>
            <TableCell data-card-title className="font-medium">{r.name}</TableCell>
            <TableCell className="tabular-nums">{r.areaSqm ?? "-"}</TableCell>
            <TableCell>
              <Badge variant="outline" className={STATUS_META[r.status].badge}>
                {STATUS_META[r.status].label}
              </Badge>
            </TableCell>
            {canEdit && (
              <TableCell>
                <RowActions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
              </TableCell>
            )}
          </TableRow>
        ))}
      />
    </div>
  )
}

// ==================== SHARED UI ====================

function TableShell({
  cols,
  rows,
}: {
  cols: (string | undefined)[]
  rows: React.ReactNode
}) {
  const visibleCols = cols.filter((c): c is string => c !== undefined)
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50">
          {visibleCols.map((c, i) => (
            <TableHead key={i}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>{rows}</TableBody>
    </Table>
  )
}

function Cell({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/10 p-2">
      <div className="flex items-center justify-center gap-1 text-xs opacity-80">{icon}{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
  )
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onDelete}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  )
}

// ==================== SITE DIALOG ====================

function SiteDialog({
  open,
  site,
  onClose,
  onSave,
}: {
  open: boolean
  site?: SerializedSite
  onClose: () => void
  onSave: (id: number, input: SiteInput) => Promise<string | null>
}) {
  const isEdit = !!site
  const [code, setCode] = useState(site?.code ?? "")
  const [name, setName] = useState(site?.name ?? "")
  const [province, setProvince] = useState(site?.province ?? "")
  const [lat, setLat] = useState(site?.lat != null ? String(site.lat) : "")
  const [lng, setLng] = useState(site?.lng != null ? String(site.lng) : "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const input = (): SiteInput => ({ code, name, province, lat, lng })

  function save() {
    setError(null)
    setBusy(true)
    onSave(site?.id ?? 0, input()).then((err) => {
      setBusy(false)
      if (err) return setError(err)
      onClose()
    })
  }

  const label = (text: string) => (
    <Label className="text-xs leading-none text-muted-foreground">{text}</Label>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขสถานี" : "เพิ่มสถานีใหม่"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `รหัสสถานี: ${site!.code} (แก้ไขไม่ได้)` : "กำหนดรหัสสถานีภาษาอังกฤษด้วยตัวเอง (แก้ไขในภายหลังไม่ได้)"}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm font-medium text-destructive">{ERROR_LABEL[error] ?? error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            {label("รหัสสถานี")}
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="เช่น PAKBB"
              disabled={isEdit}
              maxLength={10}
            />
          </div>
          <div className="col-span-2 space-y-1">
            {label("ชื่อสถานี")}
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            {label("จังหวัด")}
            <Input value={province} onChange={(e) => setProvince(e.target.value)} />
          </div>
          <div className="space-y-1">
            {label("ละติจูด (Lat)")}
            <Input type="number" value={lat} onChange={(e) => setLat(e.target.value)} step="any" />
          </div>
          <div className="space-y-1">
            {label("ลองจิจูด (Lng)")}
            <Input type="number" value={lng} onChange={(e) => setLng(e.target.value)} step="any" />
          </div>
        </div>

        <DialogActions busy={busy} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  )
}

// ==================== BUILDING DIALOG ====================

function BuildingDialog({
  open,
  siteId,
  siteCode,
  building,
  onClose,
  onSave,
}: {
  open: boolean
  siteId: number
  siteCode: string
  building?: SerializedBuilding
  onClose: () => void
  onSave: (id: number, input: BuildingInput) => Promise<string | null>
}) {
  const isEdit = !!building
  const [name, setName] = useState(building?.name ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)
    setBusy(true)
    const promise = isEdit
      ? onSave(building!.id, { siteId, name })
      : onSave(0, { siteId, name })
    promise.then((err) => {
      setBusy(false)
      if (err) return setError(err)
      onClose()
    })
  }

  const label = (text: string) => (
    <Label className="text-xs leading-none text-muted-foreground">{text}</Label>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขอาคาร" : "เพิ่มอาคารใหม่"}</DialogTitle>
          <DialogDescription>
            รหัสอาคารจะสร้างอัตโนมัติตามสถานี {siteCode}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm font-medium text-destructive">{ERROR_LABEL[error] ?? error}</p>}

        <div className="space-y-3">
          <div className="space-y-1">
            {label("สถานี")}
            <Input value={siteCode} disabled className="font-mono" />
          </div>
          <div className="space-y-1">
            {label("ชื่ออาคาร")}
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น หอเทียบเรือหลัก" />
          </div>
        </div>

        <DialogActions busy={busy} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  )
}

// ==================== FLOOR DIALOG ====================

function FloorDialog({
  open,
  buildingId,
  buildingCode,
  floor,
  onClose,
  onSave,
}: {
  open: boolean
  buildingId: number
  buildingCode: string
  floor?: SerializedFloor
  onClose: () => void
  onSave: (id: number, input: FloorInput) => Promise<string | null>
}) {
  const isEdit = !!floor
  const [level, setLevel] = useState(floor ? String(floor.level) : "")
  const [label, setLabel] = useState(floor?.label ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewCode = isEdit
    ? floor.code
    : level && /^\d+$/.test(level)
      ? `${buildingCode}-F${String(Number(level)).padStart(2, "0")}`
      : ""

  function save() {
    setError(null)
    setBusy(true)
    const promise = isEdit
      ? onSave(floor!.id, { buildingId, level, label })
      : onSave(0, { buildingId, level, label })
    promise.then((err) => {
      setBusy(false)
      if (err) return setError(err)
      onClose()
    })
  }

  const labelCmp = (text: string) => (
    <Label className="text-xs leading-none text-muted-foreground">{text}</Label>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขชั้น" : "เพิ่มชั้นใหม่"}</DialogTitle>
          <DialogDescription>
            รหัสชั้นจะสร้างอัตโนมัติตามอาคาร {buildingCode}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm font-medium text-destructive">{ERROR_LABEL[error] ?? error}</p>}

        <div className="space-y-3">
          <div className="space-y-1">
            {labelCmp("อาคาร")}
            <Input value={buildingCode} disabled className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              {labelCmp("ระดับชั้น (เลข)")}
              <Input type="number" value={level} onChange={(e) => setLevel(e.target.value)} min={0} />
            </div>
            <div className="space-y-1">
              {labelCmp("ชื่อ/ป้ายชั้น")}
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น ชั้น 1" />
            </div>
          </div>
          {previewCode && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">รหัสชั้น (auto):</span>
              <span className="font-mono text-sm font-medium">{previewCode}</span>
            </div>
          )}
        </div>

        <DialogActions busy={busy} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  )
}

// ==================== ROOM DIALOG ====================

const STATUS_OPTIONS: RoomStatus[] = ["VACANT", "OCCUPIED", "MAINTENANCE", "RESERVED"]
const selectCls =
  "h-9 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring disabled:opacity-60"

function RoomDialog({
  open,
  floorId,
  floorCode,
  room,
  onClose,
  onSave,
}: {
  open: boolean
  floorId: number
  floorCode: string
  room?: SerializedLocationRoom
  onClose: () => void
  onSave: (id: number, input: RoomInput) => Promise<string | null>
}) {
  const isEdit = !!room
  const [no, setNo] = useState(room ? String(room.no) : "")
  const [name, setName] = useState(room?.name ?? "")
  const [status, setStatus] = useState<RoomStatus>(room?.status ?? "OCCUPIED")
  const [area, setArea] = useState(room?.areaSqm != null ? String(room.areaSqm) : "")
  const [ceiling, setCeiling] = useState("")
  const [raisedFloor, setRaisedFloor] = useState("")
  const [floorLoad, setFloorLoad] = useState("")
  const [tenant, setTenant] = useState(room?.tenant ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewCode = isEdit
    ? room.code
    : no && /^\d+$/.test(no)
      ? `${floorCode}-R${String(Number(no)).padStart(2, "0")}`
      : ""

  const input = (): RoomInput => ({
    floorId,
    no,
    name,
    status,
    areaSqm: area,
    ceilingHeightM: ceiling,
    raisedFloorCm: raisedFloor,
    floorLoadKgm2: floorLoad,
    tenant,
  })

  function save() {
    setError(null)
    setBusy(true)
    const promise = isEdit ? onSave(room!.id, input()) : onSave(0, input())
    promise.then((err) => {
      setBusy(false)
      if (err) return setError(err)
      onClose()
    })
  }

  const label = (text: string) => (
    <Label className="text-xs leading-none text-muted-foreground">{text}</Label>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `แก้ไขห้อง: ${room!.name}` : "เพิ่มห้องใหม่"}</DialogTitle>
          <DialogDescription>รหัสห้องจะสร้างอัตโนมัติตามชั้น {floorCode}</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm font-medium text-destructive">{ERROR_LABEL[error] ?? error}</p>}

        <div className="space-y-5">
          <section>
            <h3 className="mb-3 text-sm font-semibold">ข้อมูลห้อง</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                {label("ลำดับ (no.)")}
                <Input type="number" value={no} onChange={(e) => setNo(e.target.value)} min={0} />
              </div>
              <div className="space-y-1">
                {label("สถานะ")}
                <select
                  className={selectCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RoomStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_META[s].label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 space-y-1 sm:col-span-1">
                {label("ชื่อห้อง")}
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              {previewCode && (
                <div className="col-span-2 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 sm:col-span-3">
                  <span className="text-xs text-muted-foreground">รหัสห้อง (auto):</span>
                  <span className="font-mono text-sm font-medium">{previewCode}</span>
                </div>
              )}
              <div className="space-y-1">
                {label("พื้นที่ (ตร.ม.)")}
                <Input type="number" value={area} onChange={(e) => setArea(e.target.value)} min={0} step="any" />
              </div>
              <div className="space-y-1">
                {label("ความสูงเพดาน (ม.)")}
                <Input type="number" value={ceiling} onChange={(e) => setCeiling(e.target.value)} min={0} step="any" />
              </div>
              <div className="space-y-1">
                {label("Raised Floor (ซม.)")}
                <Input type="number" value={raisedFloor} onChange={(e) => setRaisedFloor(e.target.value)} min={0} step="any" />
              </div>
              <div className="space-y-1">
                {label("Floor Load (กก./ตร.ม.)")}
                <Input type="number" value={floorLoad} onChange={(e) => setFloorLoad(e.target.value)} min={0} step="any" />
              </div>
              <div className="col-span-2 space-y-1">
                {label("ผู้ถือครอง/ผู้เช่า")}
                <Input value={tenant} onChange={(e) => setTenant(e.target.value)} />
              </div>
            </div>
          </section>
        </div>

        <DialogActions busy={busy} onClose={onClose} onSave={save} />
      </DialogContent>
    </Dialog>
  )
}

// ==================== DIALOG ACTIONS ====================

function DialogActions({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t pt-4">
      <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
        <X data-icon="inline-start" />
        ยกเลิก
      </Button>
      <Button type="button" onClick={onSave} disabled={busy}>
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </Button>
    </div>
  )
}
