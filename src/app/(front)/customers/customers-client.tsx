"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CUSTOMER_STAGES,
  CUSTOMER_STAGE_META,
  type CustomerStage,
  type SerializedCustomer,
} from "@/lib/cls";
import {
  createCustomer,
  deleteCustomer,
  updateCustomer,
  type CustomerInput,
} from "./actions";
import { Building2, Eye, Pencil, Phone, Plus, Trash2, UserRound } from "lucide-react";

type Props = {
  customers: SerializedCustomer[];
  canEdit: boolean;
};

const ERROR_LABEL: Record<string, string> = {
  unauthorized: "กรุณาเข้าสู่ระบบ",
  forbidden: "ต้องเป็น Admin หรือ Editor เท่านั้น",
  "invalid-input": "กรอกข้อมูลไม่ถูกต้อง (ชื่อบริษัท, ผู้ติดต่อ, เบอร์โทร จำเป็น)",
  "not-found": "ไม่พบข้อมูลลูกค้า",
  "server-error": "เกิดข้อผิดพลาด กรุณาลองใหม่",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function stageOf(v: string): CustomerStage {
  return (CUSTOMER_STAGES as readonly string[]).includes(v) ? (v as CustomerStage) : "INQUIRY";
}

function emptyForm(): CustomerFormValue {
  return {
    name: "",
    contactName: "",
    contactPosition: "",
    contactPhone: "",
    contactEmail: "",
    note: "",
  };
}

function formFromCustomer(c: SerializedCustomer): CustomerFormValue {
  return {
    name: c.name,
    contactName: c.contactName,
    contactPosition: c.contactPosition ?? "",
    contactPhone: c.contactPhone,
    contactEmail: c.contactEmail ?? "",
    note: c.note ?? "",
  };
}

type CustomerFormValue = {
  name: string;
  contactName: string;
  contactPosition: string;
  contactPhone: string;
  contactEmail: string;
  note: string;
};

export default function CustomersClient({ customers, canEdit }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SerializedCustomer | "new" | null>(null);
  const [viewing, setViewing] = useState<SerializedCustomer | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (!q) return true;
      return [
        c.name,
        c.contactName,
        c.contactPosition ?? "",
        c.contactPhone,
        c.contactEmail ?? "",
        c.note ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [customers, query]);

  function handleDelete(c: SerializedCustomer) {
    if (!window.confirm(`ลบลูกค้า ${c.code} "${c.name}" ?`)) return;
    startTransition(async () => {
      const res = await deleteCustomer(c.id);
      if (!res.ok) {
        alert(ERROR_LABEL[res.error ?? "server-error"] ?? "เกิดข้อผิดพลาด");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-9 max-w-xs"
          aria-label="ค้นหาลูกค้า"
          placeholder="ค้นหา บริษัท / ผู้ติดต่อ / ตำแหน่ง / เบอร์โทร..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} ราย</span>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus /> เพิ่มลูกค้า
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>ชื่อบริษัท</TableHead>
            <TableHead>ผู้ติดต่อ</TableHead>
            <TableHead>ตำแหน่งลูกค้า</TableHead>
            <TableHead>เบอร์โทร</TableHead>
            <TableHead>อีเมล</TableHead>
            <TableHead>หมายเหตุ</TableHead>
            <TableHead className="w-24 text-center">ดู / แก้ไข</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                ไม่พบข้อมูลลูกค้า
              </TableCell>
            </TableRow>
          )}
          {filtered.map((c) => (
            <TableRow key={c.id}>
              <TableCell data-card-title className="font-medium">
                {c.name}
              </TableCell>
              <TableCell>{c.contactName}</TableCell>
              <TableCell>{c.contactPosition ?? "-"}</TableCell>
              <TableCell className="whitespace-nowrap">{c.contactPhone}</TableCell>
              <TableCell className="break-all">{c.contactEmail ?? "-"}</TableCell>
              <TableCell className="max-w-64 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {c.note ?? "-"}
              </TableCell>
              <TableCell className="w-24">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    tabIndex={-1}
                    onClick={() => setViewing(c)}
                    aria-label="ดูข้อมูล"
                  >
                    <Eye className="size-3.5" />
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      tabIndex={-1}
                      onClick={() => setEditing(c)}
                      aria-label="แก้ไข"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      tabIndex={-1}
                      onClick={() => handleDelete(c)}
                      aria-label="ลบ"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing && (
        <CustomerFormDialog
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {viewing && <CustomerDetailDialog customer={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function label(text: string, htmlFor?: string) {
  return <FieldLabel htmlFor={htmlFor} className="text-xs leading-none text-muted-foreground">{text}</FieldLabel>;
}

function CustomerFormDialog({
  customer,
  onClose,
}: {
  customer: SerializedCustomer | null;
  onClose: () => void;
}) {
  const [, startTransition] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState<CustomerFormValue>(() =>
    customer ? formFromCustomer(customer) : emptyForm()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<CustomerFormValue>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setError(null);
    setBusy(true);
    const input: CustomerInput = {
      id: customer?.id,
      name: form.name,
      contactName: form.contactName,
      contactPosition: form.contactPosition,
      contactPhone: form.contactPhone,
      contactEmail: form.contactEmail,
      note: form.note,
    };
    startTransition(async () => {
      try {
        const res = customer
          ? await updateCustomer(input)
          : await createCustomer(input);
        if (!res.ok && res.error) {
          setError(res.error);
          return;
        }
        onClose();
        router.refresh();
      } catch {
        setError("server-error");
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? `แก้ไขลูกค้า: ${customer.code}` : "เพิ่มลูกค้าใหม่"}</DialogTitle>
          <DialogDescription>
            ข้อมูลพื้นฐานลูกค้า (ชื่อบริษัท, ผู้ติดต่อ, เบอร์โทร จำเป็น)
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm font-medium text-destructive">
            {ERROR_LABEL[error] ?? "เกิดข้อผิดพลาด"}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            {label("ชื่อบริษัท/หน่วยงาน *", "cust-name")}
            <Input
              id="cust-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="เช่น National Telecom"
            />
          </div>
          <div className="space-y-1">
            {label("ผู้ติดต่อ *", "cust-contact-name")}
            <Input
              id="cust-contact-name"
              value={form.contactName}
              onChange={(e) => set({ contactName: e.target.value })}
              placeholder="ชื่อ-นามสกุล"
            />
          </div>
          <div className="space-y-1">
            {label("ตำแหน่งลูกค้า", "cust-contact-position")}
            <Input
              id="cust-contact-position"
              value={form.contactPosition}
              onChange={(e) => set({ contactPosition: e.target.value })}
              placeholder="เช่น ผู้จัดการฝ่ายวิศวกรรม"
            />
          </div>
          <div className="space-y-1">
            {label("เบอร์โทร *", "cust-contact-phone")}
            <Input
              id="cust-contact-phone"
              value={form.contactPhone}
              onChange={(e) => set({ contactPhone: e.target.value })}
              placeholder="0X-XXX-XXXX"
            />
          </div>
          <div className="space-y-1">
            {label("อีเมล", "cust-contact-email")}
            <Input
              id="cust-contact-email"
              type="email"
              value={form.contactEmail}
              onChange={(e) => set({ contactEmail: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1">
          {label("หมายเหตุ", "cust-note")}
          <Textarea
            id="cust-note"
            rows={3}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="รายละเอียดเพิ่มเติมเกี่ยวกับลูกค้า"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            ปิด
          </Button>
          <Button type="button" onClick={save} disabled={busy}>
            {busy ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailDialog({
  customer,
  onClose,
}: {
  customer: SerializedCustomer;
  onClose: () => void;
}) {
  const meta = CUSTOMER_STAGE_META[stageOf(customer.stage)];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="size-4" /> {customer.name}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {customer.code} · วันที่สอบถาม {fmtDate(customer.inquiryDate)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">ขั้นตอน</dt>
            <dd className="pt-1">
              <Badge variant="outline" className={meta.badge}>
                {meta.label}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">ผู้ติดต่อ</dt>
            <dd className="pt-1 text-sm font-medium">{customer.contactName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">ตำแหน่งลูกค้า</dt>
            <dd className="pt-1 text-sm font-medium">{customer.contactPosition ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">เบอร์โทร / อีเมล</dt>
            <dd className="pt-1 text-sm font-medium">
              <span className="flex items-center gap-1">
                <Phone className="size-3 text-muted-foreground" /> {customer.contactPhone}
              </span>
              <span className="text-xs text-muted-foreground">{customer.contactEmail ?? "-"}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">ห้องที่สนใจ</dt>
            <dd className="pt-1 text-sm font-medium">
              {customer.interestedRooms.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {customer.interestedRooms.map((code) => (
                    <Badge key={code} variant="outline" className="font-mono text-[10px]">
                      {code}
                    </Badge>
                  ))}
                </div>
              ) : (
                "-"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">สัญญา</dt>
            <dd className="pt-1 text-sm font-medium">
              {customer.contractNo ? (
                <>
                  <div>{customer.contractNo}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(customer.contractStart)} → {fmtDate(customer.contractEnd)}
                  </div>
                </>
              ) : (
                "-"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">ห้องที่เช่าจริง</dt>
            <dd className="pt-1 text-sm font-medium">
              {customer.rentedRooms.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {customer.rentedRooms.map((r) => (
                    <Badge
                      key={r.code}
                      variant="outline"
                      className="gap-1 font-mono text-[10px]"
                    >
                      <Building2 className="size-3" />
                      {r.code}
                    </Badge>
                  ))}
                </div>
              ) : (
                "-"
              )}
            </dd>
          </div>
        </dl>

        {customer.note && (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">หมายเหตุ</div>
            <p className="whitespace-pre-wrap text-sm">{customer.note}</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            ปิด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
