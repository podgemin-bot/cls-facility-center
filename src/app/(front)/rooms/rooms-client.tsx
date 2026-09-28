"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_META, shortOptionLabel, type RoomStatus, type SerializedRoom } from "@/lib/cls";
import {
  SecurityForm,
  securityFormFromData,
  type SecurityFormValue,
} from "@/components/security-form";
import {
  deleteRoomPhoto,
  updateRoom,
  updateRoomSecurity,
  uploadRoomPhoto,
  type SecurityInput,
  type UpdateRoomInput,
} from "./actions";
import {
  ImageIcon,
  MapPin,
  Pencil,
  Ruler,
  ShieldCheck,
  Trash2,
  Upload,
  Wind,
  X,
} from "lucide-react";

type Props = {
  rooms: SerializedRoom[];
  initialSite: string;
  initialBuilding: string;
  initialFloor: string;
  canEdit: boolean;
};

export default function RoomsClient({
  rooms,
  initialSite,
  initialBuilding,
  initialFloor,
  canEdit,
}: Props) {
  const [site, setSite] = useState(initialSite);
  const [building, setBuilding] = useState(initialBuilding);
  const [floor, setFloor] = useState(initialFloor);
  const [status, setStatus] = useState<RoomStatus | "">("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SerializedRoom | null>(null);
  const [editing, setEditing] = useState<SerializedRoom | null>(null);

  const sites = useMemo(() => [...new Set(rooms.map((r) => r.siteCode))].sort(), [rooms]);

  const buildings = useMemo(
    () =>
      [
        ...new Map(
          rooms
            .filter((r) => !site || r.siteCode === site)
            .map((r) => [
              r.buildingCode,
              { code: r.buildingCode, name: r.buildingName },
            ])
        ).values(),
      ].sort((a, b) => a.code.localeCompare(b.code)),
    [rooms, site]
  );

  const floors = useMemo(
    () =>
      [
        ...new Map(
          rooms
            .filter((r) => (!site || r.siteCode === site) && (!building || r.buildingCode === building))
            .map((r) => [r.floorCode, { code: r.floorCode, label: r.floorLabel }])
        ).values(),
      ].sort((a, b) => a.code.localeCompare(b.code)),
    [rooms, site, building]
  );

  const filtered = useMemo(
    () =>
rooms.filter((r) => {
        if (site && r.siteCode !== site) return false;
        if (building && r.buildingCode !== building) return false;
        if (floor && r.floorCode !== floor) return false;
        if (status && r.status !== status) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!r.code.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q))
            return false;
        }
        return true;
      }),
    [rooms, site, building, floor, status, search]
  );

  const statusCounts = useMemo(() => {
    const m = new Map<RoomStatus, number>();
    for (const r of filtered) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [filtered]);

  const selectCls =
    "h-9 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
<select
          className={selectCls}
          value={site}
          onChange={(e) => {
            setSite(e.target.value);
            setBuilding("");
            setFloor("");
          }}
        >
          <option value="">ทุกสถานี</option>
          {sites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          className={selectCls}
          value={building}
          onChange={(e) => {
            setBuilding(e.target.value);
            setFloor("");
          }}
        >
          <option value="">ทุกอาคาร</option>
          {buildings.map((b) => (
            <option key={b.code} value={b.code}>
              {b.code} ({b.name})
            </option>
          ))}
        </select>

        <select
          className={selectCls}
          value={floor}
          onChange={(e) => setFloor(e.target.value)}
        >
          <option value="">ทุกชั้น</option>
          {floors.map((f) => (
            <option key={f.code} value={f.code}>
              {f.code} ({f.label})
            </option>
          ))}
        </select>

        <select
          className={selectCls}
          value={status}
          onChange={(e) => setStatus(e.target.value as RoomStatus | "")}
        >
          <option value="">ทุกสถานะ</option>
          {(Object.keys(STATUS_META) as RoomStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>

        <div className="relative min-w-52 flex-1">
          <Input
            placeholder="ค้นหาชื่อห้อง / รหัสห้อง..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>

        <span className="text-sm whitespace-nowrap text-muted-foreground">
          {filtered.length} ห้อง
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>รหัสห้อง</TableHead>
            <TableHead>ชื่อห้อง</TableHead>
            <TableHead className="text-right">พื้นที่ (ตร.ม.)</TableHead>
            <TableHead className="text-right">ความสูง (ม.)</TableHead>
            <TableHead className="text-right">Raised Floor (ซม.)</TableHead>
            <TableHead className="text-right">Floor Load (กก./m²)</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-center">รูป</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                ไม่พบห้องที่ตรงเงื่อนไข
              </TableCell>
            </TableRow>
          )}
          {filtered.map((r) => (
            <TableRow
              key={r.id}
              className="cursor-pointer"
              onClick={() => setSelected(r)}
            >
              <TableCell className="font-mono text-xs font-medium">{r.code}</TableCell>
              <TableCell data-card-title className="font-medium">
                {r.name}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.areaSqm ?? "-"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.ceilingHeightM ?? "-"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.raisedFloorCm ?? "-"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.floorLoadKgm2 ?? "-"}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={STATUS_META[r.status].badge}>
                  {STATUS_META[r.status].label}
                </Badge>
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {r.photos.length > 0 ? `${r.photos.length}` : "-"}
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" tabIndex={-1}>
                  ดูรายละเอียด
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {statusCounts.size > 0 && <span>ในผลลัพธ์:</span>}
        {[...statusCounts.entries()].map(([s, n]) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${STATUS_META[s].dot}`} />
            {STATUS_META[s].label}: {n}
          </span>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-3xl">
          {selected && (
            <RoomDetail
              room={selected}
              canEdit={canEdit}
              onEdit={() => {
                setEditing(selected);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {editing && (
        <EditRoomDialog
          room={editing}
          open={!!editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
function RoomDetail({
  room,
  canEdit,
  onEdit,
}: {
  room: SerializedRoom;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const sec = room.security;
  const specs: [string, string][] = [
    ["พื้นที่", room.areaSqm != null ? `${room.areaSqm} ตร.ม.` : "-"],
    ["ความสูงเพดาน", room.ceilingHeightM != null ? `${room.ceilingHeightM} ม.` : "-"],
    ["Raised Floor", room.raisedFloorCm != null ? `${room.raisedFloorCm} ซม.` : "-"],
    ["Floor Load", room.floorLoadKgm2 != null ? `${room.floorLoadKgm2} กก./ตร.ม.` : "-"],
    ["ผู้ถือครอง/ผู้เช่า", room.tenant ?? "-"],
  ];

const secRows: [string, string | number | null | undefined][] = sec
    ? [
        ["กล้อง CCTV", sec.cctvCount != null ? `${sec.cctvCount} ตัว` : "-"],
        ["Access Control", sec.accessControl],
        ["ระบบดับเพลิง", shortOptionLabel(sec.fireSuppression)],
        ["Smoke Detector", shortOptionLabel(sec.vesda)],
      ]
    : [];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <DialogTitle>{room.name}</DialogTitle>
          <Badge variant="outline" className={STATUS_META[room.status].badge}>
            {STATUS_META[room.status].label}
          </Badge>
          <span className="flex-1" />
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil data-icon="inline-start" />
              แก้ไข
            </Button>
          )}
        </div>
        <DialogDescription className="flex flex-wrap items-center gap-x-2 font-mono text-xs">
          {room.code}
          <span className="font-sans">
            · {room.buildingName} ({room.buildingCode}) · {room.floorLabel}
          </span>
          <span className="inline-flex items-center gap-0.5 font-sans">
            <MapPin className="size-3" /> {room.siteName} ({room.siteCode})
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <Section icon={<Ruler className="size-4" />} title="สเปกห้อง">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {specs.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {sec && (
          <Section icon={<ShieldCheck className="size-4" />} title="ระบบความปลอดภัย">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {secRows.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-sm font-medium">{v ?? "-"}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {room.cooling.length > 0 && (
          <Section icon={<Wind className="size-4" />} title="เครื่องปรับอากาศ">
            <div className="space-y-3">
              {room.cooling.map((c) => (
                <div key={c.code} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{c.code}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>BTU: {c.specs.btuTotal?.toLocaleString() ?? "-"}</span>
                    <span>
                      พร้อมใช้ {c.specs.unitsReady ?? "-"}/{c.specs.unitsTotal ?? "-"} ชุด
                    </span>
                    <span>ประสิทธิภาพ: {c.specs.efficiencyPct != null ? `${c.specs.efficiencyPct}%` : "-"}</span>
                    {c.model && c.model !== "-" && <span>รุ่น: {c.model}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section
          icon={<ImageIcon className="size-4" />}
          title={`ภาพถ่าย (${room.photos.length})`}
        >
          {room.photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีภาพถ่าย</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {room.photos.map((p) => (
                <a key={p.url} href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`${room.name} - ${p.name}`}
                    loading="lazy"
                    className="aspect-video w-full rounded-md border object-cover transition-opacity hover:opacity-85"
                  />
                </a>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
const STATUS_OPTIONS: RoomStatus[] = ["VACANT", "OCCUPIED", "MAINTENANCE", "RESERVED"];

const ROOM_ERROR_LABEL: Record<string, string> = {
  unauthorized: "กรุณาเข้าสู่ระบบ",
  forbidden: "ต้องเป็น Admin/Editor เท่านั้น",
  "invalid-input": "ข้อมูลไม่ถูกต้อง",
  "invalid-type": "ไฟล์ต้องเป็นรูปภาพ (jpg/png/webp)",
  "too-large": "ไฟล์ใหญ่เกิน 10MB",
  "not-found": "ไม่พบห้องนี้",
  "server-error": "เกิดข้อผิดพลาด กรุณาลองใหม่",
};

const selectCls =
  "h-9 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring";

function EditRoomDialog({
  room,
  open,
  onClose,
}: {
  room: SerializedRoom;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [name, setName] = useState(room.name);
  const [status, setStatus] = useState<RoomStatus>(room.status);
  const [no, setNo] = useState(room.no.toString());
  const [area, setArea] = useState(room.areaSqm != null ? String(room.areaSqm) : "");
  const [ceiling, setCeiling] = useState(
    room.ceilingHeightM != null ? String(room.ceilingHeightM) : ""
  );
  const [raisedFloor, setRaisedFloor] = useState(
    room.raisedFloorCm != null ? String(room.raisedFloorCm) : ""
  );
  const [floorLoad, setFloorLoad] = useState(
    room.floorLoadKgm2 != null ? String(room.floorLoadKgm2) : ""
  );
  const [tenant, setTenant] = useState(room.tenant ?? "");

  const secForm = useState<SecurityFormValue>(() => securityFormFromData(room.security));
  const [secValue, setSecValue] = secForm;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const roomInput = (): UpdateRoomInput => ({
    id: room.id,
    name,
    status,
    no,
    areaSqm: area,
    ceilingHeightM: ceiling,
    raisedFloorCm: raisedFloor,
    floorLoadKgm2: floorLoad,
    tenant,
  });

  const securityInput = (): SecurityInput => ({
    roomId: room.id,
    cctvCount: secValue.cctvCount,
    accessControl: secValue.accessControl,
    fireSuppression: secValue.fireSuppression,
    vesda: secValue.vesda,
  });

  function saveRoom() {
    setError(null);
    setSuccess(null);
    setBusy(true);
    startTransition(async () => {
      const [r1, r2] = await Promise.all([
        updateRoom(roomInput()),
        updateRoomSecurity(securityInput()),
      ]);
      setBusy(false);
      if (!r1.ok && r1.error) return setError(r1.error);
      if (!r2.ok && r2.error) return setError(r2.error);
      setSuccess("บันทึกข้อมูลห้องเรียบร้อย");
      router.refresh();
    });
  }

  function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    startTransition(async () => {
      const res = await uploadRoomPhoto(room.id, file);
      setBusy(false);
      if (!res.ok) return setError(res.error ?? "server-error");
      setSuccess("อัปโหลดรูปเรียบร้อย");
      router.refresh();
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(name: string) {
    if (!window.confirm("ลบรูปนี้แน่ใจหรือไม่?")) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    startTransition(async () => {
      const res = await deleteRoomPhoto(room.id, name);
      setBusy(false);
      if (!res.ok) return setError(res.error ?? "server-error");
      setSuccess("ลบรูปเรียบร้อย");
      router.refresh();
    });
  }

  const label = (text: string) => (
    <Label className="text-xs leading-none text-muted-foreground">{text}</Label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>แก้ไข: {room.name}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{room.code}</DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm font-medium text-destructive">
            {ROOM_ERROR_LABEL[error] ?? "เกิดข้อผิดพลาด"}
          </p>
        )}
        {success && <p className="text-sm font-medium text-emerald-600">{success}</p>}

        <div className="space-y-5">
          <section>
            <h3 className="mb-3 text-sm font-semibold">ข้อมูลห้อง</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="col-span-2 space-y-1 sm:col-span-1">
                {label("ลำดับ (no.)")}
                <Input
                  type="number"
                  value={no}
                  onChange={(e) => setNo(e.target.value)}
                  min={0}
                />
              </div>
              <div className="col-span-2 space-y-1 sm:col-span-1">
                {label("สถานะ")}
                <select
                  className={selectCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as RoomStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 space-y-1 sm:col-span-1">
                {label("ชื่อห้อง")}
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
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

          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <ShieldCheck className="size-4 text-primary" /> ระบบความปลอดภัย
            </h3>
            <SecurityForm value={secValue} onChange={setSecValue} />
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <ImageIcon className="size-4 text-primary" /> ภาพถ่าย ({room.photos.length})
            </h3>
            <div className="mb-3 flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => upload(e.target.files)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload data-icon="inline-start" />
                อัปโหลดรูป
              </Button>
            </div>
            {room.photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีภาพถ่าย</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {room.photos.map((p) => (
                  <div key={p.url} className="group relative overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.name}
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="ลบรูป"
                      onClick={() => removePhoto(p.name)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            <X data-icon="inline-start" />
            ปิด
          </Button>
          <Button type="button" onClick={saveRoom} disabled={busy}>
            {busy ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
