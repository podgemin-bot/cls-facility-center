"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_META, type PlanRoom, type RoomPhotoFile, type RoomStatus, type SerializedFloorPlan } from "@/lib/cls";
import { savePin } from "./actions";
import { Lightbox } from "@/components/lightbox";
import { Camera, Crosshair, MapPin, PencilLine, Ruler } from "lucide-react";

type Props = {
  floors: SerializedFloorPlan[];
  photos: Record<number, RoomPhotoFile[]>;
  initialFloor: string;
  canEdit: boolean;
};

type PinOverride = { x: number; y: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(100, Math.max(0, n));

function resolvePin(
  room: PlanRoom,
  overrides: Record<number, PinOverride>
): PinOverride | null {
  const o = overrides[room.id];
  if (o) return o;
  if (room.pin && room.pin.x != null && room.pin.y != null) {
    return { x: room.pin.x, y: room.pin.y };
  }
  return null;
}

export default function FloorplanClient({
  floors,
  photos,
  initialFloor,
  canEdit,
}: Props) {
  const sites = useMemo(
    () =>
      [...new Map(floors.map((f) => [f.siteCode, f.siteName])).entries()].map(
        ([code, name]) => ({ code, name })
      ),
    [floors]
  );

  const initialSite =
    floors.find((f) => f.code === initialFloor)?.siteCode ?? sites[0]?.code ?? "";

  const [siteCode, setSiteCode] = useState(initialSite);
  const [floorCode, setFloorCode] = useState(
    floors.find((f) => f.code === initialFloor)?.code ??
      floors.find((f) => f.siteCode === initialSite)?.code ??
      ""
  );
  const [statusFilter, setStatusFilter] = useState<Set<RoomStatus>>(
    new Set(Object.keys(STATUS_META) as RoomStatus[])
  );

  const [editorMode, setEditorMode] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<number, PinOverride>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ images: RoomPhotoFile[]; index: number } | null>(null);
  const router = useRouter();

  const siteFloors = useMemo(
    () => floors.filter((f) => f.siteCode === siteCode),
    [floors, siteCode]
  );
  const floor = useMemo(
    () => floors.find((f) => f.code === floorCode) ?? null,
    [floors, floorCode]
  );

  const placedRooms = useMemo(
    () => (floor?.rooms ?? []).filter((r) => resolvePin(r, overrides) !== null),
    [floor, overrides]
  );
  const unplacedRooms = useMemo(
    () =>
      (floor?.rooms ?? []).filter(
        (r) => !placedRooms.some((p) => p.id === r.id)
      ),
    [floor, placedRooms]
  );

  const selectedRoom = floor?.rooms.find((r) => r.id === selectedRoomId) ?? null;
  const activeRoom = floor?.rooms.find((r) => r.id === activeRoomId) ?? null;

  function placePin(roomId: number, x: number, y: number) {
    const px = round2(clamp01(x));
    const py = round2(clamp01(y));
    setSaving(true);
    setSaveError(null);
    startTransition(async () => {
      const res = await savePin(roomId, px, py);
      setSaving(false);
      if (!res.ok) {
        setSaveError(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      setOverrides((m) => ({ ...m, [roomId]: { x: px, y: py } }));
      router.refresh();
    });
  }

  function onPlanClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!canEdit || !editorMode || !activeRoom || saving) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    placePin(activeRoom.id, ((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100);
  }

  function onPinClick(e: React.MouseEvent, roomId: number) {
    e.stopPropagation();
    if (editorMode && canEdit) {
      setActiveRoomId(roomId);
      return;
    }
    setSelectedRoomId(roomId);
  }

  const selectCls =
    "h-9 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring";

  const visiblePins = placedRooms.filter((r) => statusFilter.has(r.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={selectCls}
          value={siteCode}
          onChange={(e) => {
            const s = e.target.value;
            setSiteCode(s);
            setActiveRoomId(null);
            setEditorMode(false);
            setFloorCode(floors.find((f) => f.siteCode === s)?.code ?? "");
          }}
        >
          {sites.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1">
          {siteFloors.map((f) => (
            <Button
              key={f.code}
              variant={f.code === floorCode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFloorCode(f.code);
                setActiveRoomId(null);
              }}
            >
              {f.label}
              <span className="text-xs opacity-70">{f.rooms.length} ห้อง</span>
            </Button>
          ))}
        </div>

        <div className="flex-1" />

        {canEdit && (
          <Button
            variant={editorMode ? "secondary" : "outline"}
            size="sm"
            aria-expanded={editorMode}
            onClick={() => {
              setEditorMode((v) => !v);
              setSaveError(null);
            }}
          >
            <PencilLine data-icon="inline-start" />
            {editorMode ? "ปิด Pin Editor" : "Pin Editor"}
          </Button>
        )}
      </div>

      {editorMode && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Crosshair className="size-4 text-primary" />
            <span className="font-medium">โหมดวางหมุด:</span>
            <span>เลือกห้องที่ต้องการวางหมุด แล้วคลิกตำแหน่งบนผังชั้น</span>
            {activeRoom && (
              <Badge variant="outline" className="font-mono">
                {activeRoom.code} · {activeRoom.name}
              </Badge>
            )}
            {saving && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Spinner className="size-3.5" /> กำลังบันทึก...
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className={selectCls}
              value={activeRoomId ?? ""}
              onChange={(e) =>
                setActiveRoomId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">— เลือกห้อง —</option>
              {(floor?.rooms ?? []).map((r) => {
                const has = resolvePin(r, overrides) !== null;
                return (
                  <option key={r.id} value={r.id}>
                    {r.code} · {r.name}
                    {has ? " (มีหมุดแล้ว)" : ""}
                  </option>
                );
              })}
            </select>
            {saveError && (
              <span className="text-sm font-medium text-destructive">
                บันทึกไม่สำเร็จ{saveError === "forbidden" ? " — ต้องเป็น admin/editor" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {floor && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <Card>
            {floor.planImage ? (
              <CardContent
                className={`relative ${editorMode && activeRoom ? "cursor-crosshair" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={floor.planImage}
                  alt={`ผังชั้น ${floor.buildingName} ${floor.label}`}
                  onClick={onPlanClick}
                  draggable={false}
                  className="w-full select-none rounded-lg border bg-white"
                />
                {visiblePins.map((r) => {
                  const p = resolvePin(r, overrides)!;
                  const isActive = editorMode && activeRoomId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      title={`${r.code} · ${r.name}`}
                      style={{ left: `${p.x}%`, top: `${p.y}%` }}
                      onClick={(e) => onPinClick(e, r.id)}
                      className={`group absolute z-10 -translate-x-1/2 -translate-y-full focus-visible:outline-none`}
                    >
                      <span className="relative block size-6 transition-transform group-hover:scale-125">
                        <span
                          className={`absolute inset-0 -rotate-45 rounded-[50%_50%_50%_0] border-2 border-white shadow-md ${STATUS_META[r.status].pin} ${
                            isActive ? "ring-2 ring-primary ring-offset-1" : ""
                          }`}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold leading-none text-white">
                          {r.no}
                        </span>
                      </span>
                      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-0.5 text-[11px] text-popover-foreground shadow-md group-hover:block">
                        {r.code} · {r.name}
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            ) : (
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                ไม่มีไฟล์ผังชั้นสำหรับ{floor.label}นี้
              </CardContent>
            )}

            <CardContent className="flex flex-wrap items-center gap-2 text-xs">
              {(Object.keys(STATUS_META) as RoomStatus[]).map((s) => {
                const on = statusFilter.has(s);
                const count = (floor?.rooms ?? []).filter((r) => r.status === s).length;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setStatusFilter((prev) => {
                        const next = new Set(prev);
                        if (next.has(s)) next.delete(s);
                        else next.add(s);
                        return next;
                      })
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-opacity ${
                      on ? "" : "opacity-40"
                    }`}
                  >
                    <span className={`size-2.5 rounded-full ${STATUS_META[s].dot}`} />
                    {STATUS_META[s].label}: {count}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">ห้องบนผัง ({placedRooms.length})</CardTitle>
              </CardHeader>
              <CardContent className="max-h-72 space-y-1 overflow-y-auto">
                {placedRooms.length === 0 && (
                  <p className="text-xs text-muted-foreground">ยังไม่มีหมุดบนผังชั้นนี้</p>
                )}
                {[...placedRooms]
                  .sort((a, b) => a.no - b.no)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => (editorMode && canEdit ? setActiveRoomId(r.id) : setSelectedRoomId(r.id))}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted ${
                        editorMode && activeRoomId === r.id ? "bg-muted" : ""
                      }`}
                    >
                      <span className={`size-2 shrink-0 rounded-full ${STATUS_META[r.status].dot}`} />
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {r.code}
                      </span>
                    </button>
                  ))}
              </CardContent>
            </Card>

            {unplacedRooms.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    ยังไม่มีหมุด ({unplacedRooms.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-48 space-y-1 overflow-y-auto">
                  {unplacedRooms.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={!canEdit || !editorMode}
                      onClick={() => setActiveRoomId(r.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
                    >
                      <MapPin className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {r.code}
                      </span>
                    </button>
                  ))}
                  {!canEdit && (
                    <p className="pt-1 text-[11px] text-muted-foreground">
                      เฉพาะ admin เท่านั้นที่วางหมุดได้
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!selectedRoom} onOpenChange={(open) => !open && setSelectedRoomId(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedRoom && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <DialogTitle>{selectedRoom.name}</DialogTitle>
                  <Badge variant="outline" className={STATUS_META[selectedRoom.status].badge}>
                    {STATUS_META[selectedRoom.status].label}
                  </Badge>
                </div>
                <DialogDescription className="flex flex-wrap items-center gap-x-2 font-mono text-xs">
                  {selectedRoom.code}
                  <span className="font-sans">
                    · {floor?.buildingName} ({floor?.buildingCode}) · {floor?.label}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col items-start gap-4">
                <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">พื้นที่</dt>
                    <dd className="text-sm font-medium">
                      {selectedRoom.areaSqm != null ? `${selectedRoom.areaSqm} ตร.ม.` : "-"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">ผู้ถือครอง/ผู้เช่า</dt>
                    <dd className="text-sm font-medium">{selectedRoom.tenant ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">หมุดบนผัง</dt>
                    <dd className="font-mono text-sm font-medium">
                      {selectedRoom.pin?.code ?? "ยังไม่วาง"}
                    </dd>
                  </div>
                </dl>

                {(() => {
                  const roomPhotos = photos[selectedRoom.id] ?? [];
                  if (roomPhotos.length === 0) return null;
                  return (
                    <div className="w-full">
                      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Camera className="size-3.5 text-primary" />
                        ภาพถ่าย ({roomPhotos.length})
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        {roomPhotos.map((p, i) => (
                          <button
                            key={p.url}
                            type="button"
                            onClick={() => setLightbox({ images: roomPhotos, index: i })}
                            className="group relative overflow-hidden rounded-md border"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.url}
                              alt={`${selectedRoom.name} - ${p.name}`}
                              loading="lazy"
                              className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href={`/rooms?site=${floor?.siteCode ?? ""}&floor=${floor?.code ?? ""}`}>
                    <Ruler data-icon="inline-start" />
                    ดูข้อมูลทั้งหมดในหน้าห้อง
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Lightbox
        key={lightbox?.index ?? 0}
        images={lightbox?.images ?? []}
        initialIndex={lightbox?.index ?? 0}
        open={!!lightbox}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
