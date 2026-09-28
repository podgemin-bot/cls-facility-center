import { describe, expect, it } from "vitest";
import { PROFILE_ERROR_LABEL, translateProfileError } from "@/lib/profile-errors";

describe("PROFILE_ERROR_LABEL", () => {
  it("contains Thai labels for every mapped key", () => {
    expect(PROFILE_ERROR_LABEL["invalid-password"]).toBe("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    expect(PROFILE_ERROR_LABEL["password-too-short"]).toBe("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
    expect(PROFILE_ERROR_LABEL["password-mismatch"]).toBe("รหัสผ่านไม่ตรงกัน");
    expect(PROFILE_ERROR_LABEL["cannot-revoke-current"]).toBe("ไม่สามารถออกจากระบบอุปกรณ์นี้ได้");
    expect(PROFILE_ERROR_LABEL["unauthorized"]).toBe("กรุณาเข้าสู่ระบบ");
    expect(PROFILE_ERROR_LABEL["server-error"]).toBe("เกิดข้อผิดพลาด กรุณาลองใหม่");
  });
});

describe("translateProfileError", () => {
  it("maps better-auth's uppercase underscore codes to Thai labels", () => {
    expect(translateProfileError({ error: { code: "INVALID_PASSWORD" } })).toBe(
      "รหัสผ่านปัจจุบันไม่ถูกต้อง"
    );
    expect(translateProfileError({ error: { code: "PASSWORD_TOO_SHORT" } })).toBe(
      "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร"
    );
    expect(translateProfileError({ error: { code: "PASSWORD_MISMATCH" } })).toBe(
      "รหัสผ่านไม่ตรงกัน"
    );
  });

  it("maps already-normalized English keys", () => {
    expect(translateProfileError({ error: { code: "invalid-password" } })).toBe(
      "รหัสผ่านปัจจุบันไม่ถูกต้อง"
    );
    expect(translateProfileError({ error: { name: "unauthorized" } })).toBe("กรุณาเข้าสู่ระบบ");
  });

  it("falls back to the raw message for unknown codes", () => {
    expect(
      translateProfileError({ error: { code: "USER_NOT_FOUND", message: "User not found" } })
    ).toBe("User not found");
  });

  it("falls back to a generic Thai message when nothing is known", () => {
    expect(translateProfileError({})).toBe("เกิดข้อผิดพลาด กรุณาลองใหม่");
    expect(translateProfileError({ error: {} })).toBe("เกิดข้อผิดพลาด กรุณาลองใหม่");
  });

  it("uses the status number when code is missing", () => {
    expect(translateProfileError({ error: { status: 401 } })).toBe("เกิดข้อผิดพลาด กรุณาลองใหม่");
  });
});