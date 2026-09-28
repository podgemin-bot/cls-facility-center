import { describe, expect, it } from "vitest";
import {
  shortOptionLabel,
  splitAccessControl,
  joinAccessControl,
  STATUS_ORDER,
  STATUS_META,
} from "./cls";

describe("shortOptionLabel", () => {
  it("strips a trailing parenthesised brand", () => {
    expect(shortOptionLabel("FM-200 (HFC-227ea)")).toBe("FM-200");
    expect(shortOptionLabel("Novec 1230 (FK-5-1-12)")).toBe("Novec 1230");
  });

  it("keeps plain options untouched", () => {
    expect(shortOptionLabel("CO2 Clean Agent System")).toBe("CO2 Clean Agent System");
    expect(shortOptionLabel("VESDA")).toBe("VESDA");
  });

  it("defaults empty/null/whitespace to ไม่ติดตั้ง", () => {
    expect(shortOptionLabel("")).toBe("ไม่ติดตั้ง");
    expect(shortOptionLabel(undefined)).toBe("ไม่ติดตั้ง");
    expect(shortOptionLabel(null)).toBe("ไม่ติดตั้ง");
    expect(shortOptionLabel("   ")).toBe("ไม่ติดตั้ง");
  });
});

describe("splitAccessControl", () => {
  it("splits on commas and trims", () => {
    expect(splitAccessControl("RFID Proximity Card, PIN Code , Key")).toEqual([
      "RFID Proximity Card",
      "PIN Code",
      "Key",
    ]);
  });

  it("handles null/empty input", () => {
    expect(splitAccessControl(null)).toEqual([]);
    expect(splitAccessControl("")).toEqual([]);
    expect(splitAccessControl(" , , ")).toEqual([]);
  });
});

describe("joinAccessControl", () => {
  it("joins values into a comma-separated string", () => {
    expect(joinAccessControl(["RFID Proximity Card", " PIN Code "])).toBe(
      "RFID Proximity Card, PIN Code"
    );
  });

  it("returns null when nothing selected", () => {
    expect(joinAccessControl([])).toBeNull();
    expect(joinAccessControl(["  "])).toBeNull();
  });
});

describe("status meta", () => {
  it("exposes a label for every status in order", () => {
    expect(STATUS_ORDER).toEqual(["VACANT", "OCCUPIED", "MAINTENANCE", "RESERVED"]);
    for (const s of STATUS_ORDER) {
      expect(STATUS_META[s].label).toBeTruthy();
      expect(STATUS_META[s].badge).toContain("bg-");
    }
  });
});