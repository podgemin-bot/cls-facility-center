export const PROFILE_ERROR_LABEL: Record<string, string> = {
  "invalid-password": "รหัสผ่านปัจจุบันไม่ถูกต้อง",
  "password-too-short": "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร",
  "password-mismatch": "รหัสผ่านไม่ตรงกัน",
  "cannot-revoke-current": "ไม่สามารถออกจากระบบอุปกรณ์นี้ได้",
  unauthorized: "กรุณาเข้าสู่ระบบ",
  "server-error": "เกิดข้อผิดพลาด กรุณาลองใหม่",
};

export function translateProfileError(ctx: {
  error?: { code?: string | number; status?: number; name?: string; message?: string };
}): string {
  const code = String(ctx?.error?.code ?? ctx?.error?.status ?? "");
  const name = ctx?.error?.name ?? "";
  const key = code || name || "";
  const normalized = key.toLowerCase().replaceAll("_", "-");
  return PROFILE_ERROR_LABEL[normalized] ?? ctx?.error?.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่";
}