"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import {
  nameSchema,
  passwordSchema,
  type NameFormValues,
  type PasswordFormValues,
} from "@/lib/profile-schemas";
import { translateProfileError } from "@/lib/profile-errors";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "./actions";
import type { SerializedProfileUser, SerializedSession } from "./page";

type Props = {
  user: SerializedProfileUser;
  sessions: SerializedSession[];
};

const ROLE_META: Record<
  string,
  { label: string; badge: string; summary: string }
> = {
  ADMIN: {
    label: "Admin",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    summary: "จัดการข้อมูลทั้งหมดในระบบได้ รวมถึงการจัดการสิทธิ์ผู้ใช้",
  },
  EDITOR: {
    label: "Editor",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    summary: "เพิ่ม แก้ไข และลบข้อมูลห้อง พื้นที่ และแผนผังได้",
  },
  VIEWER: {
    label: "Viewer",
    badge: "bg-slate-100 text-slate-700 border-slate-200",
    summary: "ดูข้อมูลได้อย่างเดียว ไม่สามารถแก้ไขหรือลบข้อมูลได้",
  },
};

const alertClass = (success?: string | null) =>
  success
    ? "w-full rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm font-medium text-emerald-700"
    : "w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive";

function deviceLabel(userAgent: string): string {
  if (/Mobile|Android|iPhone|iPad/i.test(userAgent)) return "มือถือ / แท็บเล็ต";
  if (/Linux|Macintosh|Windows/i.test(userAgent)) return "คอมพิวเตอร์";
  return "ไม่ทราบอุปกรณ์";
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });

export default function ProfileClient({ user, sessions }: Props) {
  const router = useRouter();
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionSuccess, setSessionSuccess] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const roleMeta = ROLE_META[user.role] ?? ROLE_META.VIEWER;

  const nameForm = useForm<NameFormValues>({
    resolver: zodResolver(nameSchema),
    defaultValues: {
      name: user.name,
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmitName(data: NameFormValues) {
    setNameError(null);
    setNameSuccess(null);
    await authClient.updateUser(
      { name: data.name },
      {
        onSuccess: () => {
          setNameSuccess("อัปเดตชื่อสำเร็จ");
          nameForm.reset({ name: data.name });
          router.refresh();
        },
        onError: (ctx) => {
          setNameError(translateProfileError(ctx));
        },
      }
    );
  }

  async function onSubmitPassword(data: PasswordFormValues) {
    setPasswordError(null);
    setPasswordSuccess(null);
    await authClient.changePassword(
      {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: true,
      },
      {
        onSuccess: () => {
          setPasswordSuccess("เปลี่ยนรหัสผ่านสำเร็จ");
          passwordForm.reset();
          router.refresh();
        },
        onError: (ctx) => {
          setPasswordError(translateProfileError(ctx));
        },
      }
    );
  }

  async function handleRevoke(token: string) {
    setSessionError(null);
    setSessionSuccess(null);
    setRevokingToken(token);
    const res = await revokeSessionAction(token);
    setRevokingToken(null);
    if (res.ok) {
      setSessionSuccess("ออกจากระบบอุปกรณ์นั้นแล้ว");
      router.refresh();
    } else {
      setSessionError(translateProfileError({ error: { code: res.error } }));
    }
  }

  async function handleRevokeAll() {
    setSessionError(null);
    setSessionSuccess(null);
    setRevokingAll(true);
    const res = await revokeOtherSessionsAction();
    setRevokingAll(false);
    setConfirmRevokeAll(false);
    if (res.ok) {
      setSessionSuccess("ออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว");
      router.refresh();
    } else {
      setSessionError(translateProfileError({ error: { code: res.error } }));
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-5 text-primary" /> ข้อมูลส่วนตัว
            </CardTitle>
            <CardDescription>
              ข้อมูลบัญชีผู้ใช้ของคุณ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <UserRound className="size-4" /> ชื่อ
              </p>
              <p className="text-lg font-semibold">{user.name}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="size-4" /> อีเมล
              </p>
              <p className="break-all font-mono text-sm">{user.email}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ShieldCheck className="size-4" /> สิทธิ์
              </p>
              <Badge className={`mt-1 border ${roleMeta.badge}`}>
                {roleMeta.label}
              </Badge>
              <p className="mt-2 text-sm text-muted-foreground">
                {roleMeta.summary}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4" /> ยืนยันอีเมล
              </p>
              {user.emailVerified ? (
                <Badge variant="outline" className="mt-1">
                  ยืนยันแล้ว
                </Badge>
              ) : (
                <Badge variant="secondary" className="mt-1">
                  ยังไม่ยืนยัน
                </Badge>
              )}
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4" /> สมัครสมาชิกเมื่อ
              </p>
              <p className="text-sm">
                {new Date(user.createdAt).toLocaleDateString("th-TH")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Laptop className="size-5 text-primary" /> อุปกรณ์ที่เข้าใช้งาน
            </CardTitle>
            <CardDescription>
              ตรวจสอบและยกเลิกเซสชันที่เข้าใช้งานบัญชีนี้
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ไม่พบเซสชันที่ใช้งาน
              </p>
            ) : (
              <ul className="space-y-3">
                {sessions.map((s) => (
                  <li
                    key={s.token}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <Laptop className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words text-sm font-medium">
                            {deviceLabel(s.userAgent)}
                          </p>
                          {s.isCurrent && (
                            <Badge className="shrink-0">อุปกรณ์นี้</Badge>
                          )}
                        </div>
                        <p className="break-words text-xs text-muted-foreground">
                          {s.ipAddress || "ไม่ทราบ IP"} · เข้าสู่ระบบเมื่อ{" "}
                          {fmtDateTime(s.createdAt)} · หมดอายุ{" "}
                          {fmtDateTime(s.expiresAt)}
                        </p>
                      </div>
                    </div>
                    {!s.isCurrent && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={revokingToken === s.token}
                        onClick={() => handleRevoke(s.token)}
                      >
                        {revokingToken === s.token
                          ? "กำลังออกจากระบบ..."
                          : "ออกจากระบบ"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            {confirmRevokeAll ? (
              <div className="w-full rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">
                  ต้องการออกจากระบบอุปกรณ์อื่นทั้งหมดหรือไม่?
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={revokingAll}
                    onClick={handleRevokeAll}
                  >
                    {revokingAll ? "กำลังออกจากระบบ..." : "ยืนยัน"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={revokingAll}
                    onClick={() => setConfirmRevokeAll(false)}
                  >
                    ยกเลิก
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={revokingAll || sessions.length <= 1}
                onClick={() => setConfirmRevokeAll(true)}
              >
                {revokingAll
                  ? "กำลังออกจากระบบ..."
                  : "ออกจากระบบอุปกรณ์อื่นทั้งหมด"}
              </Button>
            )}
            {(sessionError || sessionSuccess) && (
              <p role="alert" className={alertClass(sessionSuccess)}>
                {sessionSuccess ?? sessionError}
              </p>
            )}
          </CardFooter>
        </Card>
      </div>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-5 text-primary" /> แก้ไขชื่อ
            </CardTitle>
            <CardDescription>อัปเดตชื่อที่แสดงในระบบ</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="form-name" onSubmit={nameForm.handleSubmit(onSubmitName)}>
              <FieldGroup>
                <Controller
                  name="name"
                  control={nameForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-name-name">ชื่อ</FieldLabel>
                      <Input
                        {...field}
                        id="form-name-name"
                        type="text"
                        aria-invalid={fieldState.invalid}
                        placeholder="สมชาย ใจดี"
                        autoComplete="name"
                        onChange={(e) => {
                          field.onChange(e);
                          setNameError(null);
                          setNameSuccess(null);
                        }}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            <Button
              type="submit"
              form="form-name"
              disabled={nameForm.formState.isSubmitting}
            >
              {nameForm.formState.isSubmitting ? "กำลังบันทึก..." : "บันทึกชื่อ"}
            </Button>
            {(nameError || nameSuccess) && (
              <p role="alert" className={alertClass(nameSuccess)}>
                {nameSuccess ?? nameError}
              </p>
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-5 text-primary" /> เปลี่ยนรหัสผ่าน
            </CardTitle>
            <CardDescription>
              เปลี่ยนรหัสผ่านเพื่อความปลอดภัยของบัญชี
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              id="form-password"
              onSubmit={passwordForm.handleSubmit(onSubmitPassword)}
            >
              <FieldGroup>
                <Controller
                  name="currentPassword"
                  control={passwordForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-password-current">
                        รหัสผ่านปัจจุบัน
                      </FieldLabel>
                      <div className="relative">
                        <Input
                          {...field}
                          id="form-password-current"
                          type={showCurrent ? "text" : "password"}
                          aria-invalid={fieldState.invalid}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className="pr-10"
                          onChange={(e) => {
                            field.onChange(e);
                            setPasswordError(null);
                            setPasswordSuccess(null);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={
                            showCurrent ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                          }
                          onClick={() => setShowCurrent((v) => !v)}
                        >
                          {showCurrent ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name="newPassword"
                  control={passwordForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-password-new">
                        รหัสผ่านใหม่
                      </FieldLabel>
                      <div className="relative">
                        <Input
                          {...field}
                          id="form-password-new"
                          type={showNew ? "text" : "password"}
                          aria-invalid={fieldState.invalid}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          className="pr-10"
                          onChange={(e) => {
                            field.onChange(e);
                            setPasswordError(null);
                            setPasswordSuccess(null);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={showNew ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                          onClick={() => setShowNew((v) => !v)}
                        >
                          {showNew ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name="confirmPassword"
                  control={passwordForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="form-password-confirm">
                        ยืนยันรหัสผ่านใหม่
                      </FieldLabel>
                      <div className="relative">
                        <Input
                          {...field}
                          id="form-password-confirm"
                          type={showConfirm ? "text" : "password"}
                          aria-invalid={fieldState.invalid}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          className="pr-10"
                          onChange={(e) => {
                            field.onChange(e);
                            setPasswordError(null);
                            setPasswordSuccess(null);
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                          aria-label={
                            showConfirm ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
                          }
                          onClick={() => setShowConfirm((v) => !v)}
                        >
                          {showConfirm ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
                      </div>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col items-start gap-2">
            <Button
              type="submit"
              form="form-password"
              disabled={passwordForm.formState.isSubmitting}
            >
              {passwordForm.formState.isSubmitting
                ? "กำลังเปลี่ยนรหัสผ่าน..."
                : "เปลี่ยนรหัสผ่าน"}
            </Button>
            {(passwordError || passwordSuccess) && (
              <p role="alert" className={alertClass(passwordSuccess)}>
                {passwordSuccess ?? passwordError}
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
