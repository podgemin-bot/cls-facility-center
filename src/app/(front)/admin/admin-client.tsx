"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "next/navigation";
import {
  createUser,
  deleteUserAction,
  setUserRole,
  type Roles,
} from "./actions";
import type { SerializedAdminUser } from "./page";
import {
  Eye,
  EyeOff,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";

type Props = {
  users: SerializedAdminUser[];
};

const ROLES: Roles[] = ["ADMIN", "EDITOR", "VIEWER"];

const ROLE_META: Record<Roles, { label: string; badge: string }> = {
  ADMIN: { label: "Admin", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  EDITOR: { label: "Editor", badge: "bg-sky-100 text-sky-800 border-sky-200" },
  VIEWER: { label: "Viewer", badge: "bg-slate-100 text-slate-700 border-slate-200" },
};

const selectCls =
  "h-9 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring";

const alertClass = (success?: string | null) =>
  success
    ? "w-full rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm font-medium text-emerald-700"
    : "w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive";

const ERROR_LABEL: Record<string, string> = {
  unauthorized: "กรุณาเข้าสู่ระบบ",
  forbidden: "ต้องเป็น Admin เท่านั้น",
  "invalid-input": "กรอกข้อมูลไม่ถูกต้อง (รหัสผ่านขั้นต่ำ 8 ตัว)",
  "email-exists": "อีเมลนี้ถูกใช้แล้ว",
  "not-found": "ไม่พบผู้ใช้",
  "cannot-demote-self": "ไม่สามารถลดสิทธิ์ตัวเองได้",
  "cannot-delete-self": "ไม่สามารถลบผู้ใช้ตัวเองได้",
  "cannot-delete-last-admin": "ต้องมีผู้ดูแลระบบ (Admin) อย่างน้อย 1 คน",
  "server-error": "เกิดข้อผิดพลาด กรุณาลองใหม่",
};

const errorLabel = (key?: string | null): string | null =>
  key ? ERROR_LABEL[key] ?? "เกิดข้อผิดพลาด" : null;

export default function AdminClient({ users }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<Roles>("VIEWER");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | Roles>("ALL");

  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listSuccess, setListSuccess] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SerializedAdminUser | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [, startTransition] = useTransition();

  const roleCounts = useMemo(() => {
    const m = new Map<Roles, number>();
    for (const u of users) {
      const r = (ROLES.includes(u.role as Roles) ? u.role : "VIEWER") as Roles;
      m.set(r, (m.get(r) ?? 0) + 1);
    }
    return m;
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !(u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))) {
        return false;
      }
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, query, roleFilter]);

  const adminCount = useMemo(
    () => users.filter((u) => u.role === "ADMIN").length,
    [users]
  );

  const canDelete = (u: SerializedAdminUser) =>
    !u.isSelf && !(u.role === "ADMIN" && adminCount <= 1);

  function clearCreateFeedback() {
    setCreateError(null);
    setCreateSuccess(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateSuccess(null);
    setCreateError(null);
    if (!name.trim() || !email.trim()) {
      setCreateError("invalid-input");
      return;
    }
    if (password.length < 8) {
      setCreateError("invalid-input");
      return;
    }
    if (password !== confirm) {
      setCreateError("password-mismatch");
      return;
    }
    setBusy(true);
    startTransition(async () => {
      const res = await createUser(name, email, password, role);
      setBusy(false);
      if (!res.ok) {
        setCreateError(res.error ?? "unknown");
        return;
      }
      setCreateSuccess(`สร้างผู้ใช้ "${email}" สำเร็จ`);
      setName("");
      setEmail("");
      setPassword("");
      setConfirm("");
      setRole("VIEWER");
      router.refresh();
    });
  }

  function changeRole(u: SerializedAdminUser, r: string) {
    setListError(null);
    setListSuccess(null);
    if (u.isSelf && r !== "ADMIN") {
      setListError("cannot-demote-self");
      return;
    }
    setPendingRole(u.id);
    startTransition(async () => {
      const res = await setUserRole(u.id, r as Roles);
      setPendingRole(null);
      if (!res.ok) setListError(res.error ?? "unknown");
      else setListSuccess(`อัปเดตสิทธิ์ของ ${u.name} สำเร็จ`);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setListError(null);
    setListSuccess(null);
    startTransition(async () => {
      const res = await deleteUserAction(deleting.id);
      setDeleteBusy(false);
      if (!res.ok) {
        setListError(res.error ?? "unknown");
        setDeleting(null);
        return;
      }
      setListSuccess(`ลบผู้ใช้ "${deleting.name}" สำเร็จ`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <UserRound className="size-4" /> ทั้งหมด:{" "}
          <strong className="text-foreground">{users.length}</strong>
        </span>
        {(Object.keys(ROLE_META) as Roles[]).map((r) => (
          <span key={r} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${ROLE_META[r].badge.split(" ")[0]}`} />
            {ROLE_META[r].label}: <strong className="text-foreground">{roleCounts.get(r) ?? 0}</strong>
          </span>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="size-5 text-primary" /> สร้างผู้ใช้ใหม่
          </CardTitle>
          <CardDescription>
            ระบุข้อมูลเพื่อสร้างบัญชีผู้ใช้และกำหนดสิทธิ์เริ่มต้น
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
            <FieldGroup className="contents">
              <Field className="min-w-44 flex-1">
                <FieldLabel htmlFor="form-admin-name">ชื่อ</FieldLabel>
                <Input
                  id="form-admin-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearCreateFeedback();
                  }}
                  placeholder="สมชาย ใจดี"
                  autoComplete="off"
                />
              </Field>
              <Field className="min-w-52 flex-1">
                <FieldLabel htmlFor="form-admin-email">อีเมล</FieldLabel>
                <Input
                  id="form-admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearCreateFeedback();
                  }}
                  placeholder="you@example.com"
                  autoComplete="off"
                />
              </Field>
              <Field className="min-w-40 flex-1">
                <FieldLabel htmlFor="form-admin-password">รหัสผ่าน</FieldLabel>
                <div className="relative">
                  <Input
                    id="form-admin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearCreateFeedback();
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Field className="min-w-40 flex-1">
                <FieldLabel htmlFor="form-admin-confirm">ยืนยันรหัสผ่าน</FieldLabel>
                <div className="relative">
                  <Input
                    id="form-admin-confirm"
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      clearCreateFeedback();
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "ซ่อนรหัสผ่านยืนยัน" : "แสดงรหัสผ่านยืนยัน"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Field>
                <FieldLabel>สิทธิ์</FieldLabel>
                <select
                  aria-label="เลือกสิทธิ์สำหรับสร้าง"
                  className={selectCls}
                  value={role}
                  onChange={(e) => setRole(e.target.value as Roles)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_META[r].label}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={busy}>
              {busy ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
            </Button>
          </form>
          {(createError || createSuccess) && (
            <p role="alert" className={`mt-3 ${alertClass(createSuccess)}`}>
              {createSuccess ??
                (createError === "password-mismatch"
                  ? "รหัสผ่านไม่ตรงกัน"
                  : errorLabel(createError))}
            </p>
          )}
          {createError === null &&
            password.length > 0 &&
            confirm.length > 0 &&
            password !== confirm && (
              <FieldError className="mt-2">รหัสผ่านไม่ตรงกัน</FieldError>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-5 text-primary" /> รายชื่อผู้ใช้
          </CardTitle>
          <CardDescription>ค้นหาและกรองรายชื่อผู้ใช้ได้; คลิกเลือกสิทธิ์เพื่อเปลี่ยนแปลง</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="ค้นหาชื่อหรืออีเมล"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาชื่อหรืออีเมล"
                className="pl-9"
              />
            </div>
            <select
              aria-label="กรองตามสิทธิ์"
              className={selectCls}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "ALL" | Roles)}
            >
              <option value="ALL">ทุกสิทธิ์</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label}
                </option>
              ))}
            </select>
          </div>

          {(listError || listSuccess) && (
            <p role="alert" className={alertClass(listSuccess)}>
              {listSuccess ?? errorLabel(listError)}
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>ชื่อ</TableHead>
                <TableHead>อีเมล</TableHead>
                <TableHead>สิทธิ์</TableHead>
                <TableHead>ยืนยันอีเมล</TableHead>
                <TableHead>สมัครเมื่อ</TableHead>
                <TableHead className="w-20 text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    ยังไม่มีผู้ใช้
                  </TableCell>
                </TableRow>
              )}
              {users.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    ไม่พบผู้ใช้ที่ตรงเงื่อนไข
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((u) => (
                <TableRow key={u.id} data-user-id={u.id}>
                  <TableCell data-card-title className="font-medium">
                    {u.name}
                    {u.isSelf && (
                      <Badge variant="outline" className="ml-2">
                        คุณ
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>
                    <select
                      aria-label={`สิทธิ์ของ ${u.name}`}
                      className={selectCls}
                      value={ROLES.includes(u.role as Roles) ? u.role : "VIEWER"}
                      disabled={pendingRole !== null}
                      onChange={(e) => changeRole(u, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_META[r].label}
                        </option>
                      ))}
                    </select>
                    {pendingRole === u.id && (
                      <span className="ml-2 text-xs text-muted-foreground">กำลังอัปเดต...</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.emailVerified ? (
                      <Badge variant="outline">ยืนยันแล้ว</Badge>
                    ) : (
                      <Badge variant="secondary">ยังไม่ยืนยัน</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString("th-TH")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`ลบผู้ใช้ ${u.name}`}
                      disabled={!canDelete(u) || pendingRole !== null}
                      title={
                        u.isSelf
                          ? "ไม่สามารถลบผู้ใช้ตัวเองได้"
                          : u.role === "ADMIN" && adminCount <= 1
                            ? "ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน"
                            : "ลบผู้ใช้"
                      }
                      onClick={() => {
                        setListError(null);
                        setListSuccess(null);
                        setDeleting(u);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && !deleteBusy && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" /> ลบผู้ใช้
            </DialogTitle>
            <DialogDescription>
              คุณกำลังจะลบผู้ใช้{" "}
              <strong className="text-foreground">
                {deleting?.name} ({deleting?.email})
              </strong>{" "}
              ข้อมูลและเซสชันทั้งหมดจะถูกลบถาวร และไม่สามารถกู้คืนได้
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleting(null)}>
              ยกเลิก
            </Button>
            <Button variant="destructive" disabled={deleteBusy} onClick={confirmDelete}>
              {deleteBusy ? "กำลังลบ..." : "ยืนยันการลบ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}