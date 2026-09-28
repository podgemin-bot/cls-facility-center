import { describe, expect, it } from "vitest";
import { nameSchema, passwordSchema } from "@/lib/profile-schemas";

describe("nameSchema (แก้ไขชื่อ)", () => {
  it("accepts a valid 2-character Thai name", () => {
    const res = nameSchema.safeParse({ name: "สมชาย" });
    expect(res.success).toBe(true);
  });

  it("rejects an empty name", () => {
    const res = nameSchema.safeParse({ name: "" });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("กรุณากรอกชื่อ");
  });

  it("rejects a single-character name", () => {
    const res = nameSchema.safeParse({ name: "ก" });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("ชื่อต้องมีอย่างน้อย 2 ตัวอักษร");
  });

  it("rejects a name longer than 50 characters", () => {
    const res = nameSchema.safeParse({ name: "ก".repeat(51) });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("ชื่อต้องไม่เกิน 50 ตัวอักษร");
  });
});

describe("passwordSchema (เปลี่ยนรหัสผ่าน)", () => {
  it("accepts matching passwords with 8+ characters", () => {
    const res = passwordSchema.safeParse({
      currentPassword: "OldPass12345",
      newPassword: "NewPass12345",
      confirmPassword: "NewPass12345",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an empty current password", () => {
    const res = passwordSchema.safeParse({
      currentPassword: "",
      newPassword: "NewPass12345",
      confirmPassword: "NewPass12345",
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("กรุณากรอกรหัสผ่านปัจจุบัน");
  });

  it("rejects an empty new password", () => {
    const res = passwordSchema.safeParse({
      currentPassword: "OldPass12345",
      newPassword: "",
      confirmPassword: "",
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("กรุณากรอกรหัสผ่านใหม่");
  });

  it("rejects a new password shorter than 8 characters", () => {
    const res = passwordSchema.safeParse({
      currentPassword: "OldPass12345",
      newPassword: "1234567",
      confirmPassword: "1234567",
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.message).toBe("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
  });

  it("rejects mismatching confirmation on the confirmPassword path", () => {
    const res = passwordSchema.safeParse({
      currentPassword: "OldPass12345",
      newPassword: "NewPass12345",
      confirmPassword: "Different12345",
    });
    expect(res.success).toBe(false);
    expect(res.error?.issues[0]?.path).toEqual(["confirmPassword"]);
    expect(res.error?.issues[0]?.message).toBe("รหัสผ่านไม่ตรงกัน");
  });
});