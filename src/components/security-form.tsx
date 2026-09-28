"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCESS_CONTROL_OPTIONS,
  FIRE_SUPPRESSION_OPTIONS,
  SMOKE_DETECTOR_OPTIONS,
  shortOptionLabel,
  splitAccessControl,
  type SecurityData,
} from "@/lib/cls";

const selectCls =
  "h-9 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring";

export type SecurityFormValue = {
  cctvCount: string;
  accessControl: string[];
  fireSuppression: string;
  vesda: string;
};

export function securityFormFromData(sec?: SecurityData | null): SecurityFormValue {
  return {
    cctvCount: sec?.cctvCount != null ? String(sec.cctvCount) : "",
    accessControl: splitAccessControl(sec?.accessControl),
    fireSuppression: sec?.fireSuppression ?? "ไม่ติดตั้ง",
    vesda: sec?.vesda ?? "ไม่ติดตั้ง",
  };
}

const accessLabel = (text: string) => (
  <Label className="text-xs leading-none text-muted-foreground">{text}</Label>
);

export function SecurityForm({
  value,
  onChange,
}: {
  value: SecurityFormValue;
  onChange: (next: SecurityFormValue) => void;
}) {
  const toggleAccess = (opt: string) =>
    onChange({
      ...value,
      accessControl: value.accessControl.includes(opt)
        ? value.accessControl.filter((x) => x !== opt)
        : [...value.accessControl, opt],
    });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="space-y-1">
        {accessLabel("กล้อง CCTV")}
        <Input
          type="number"
          min={0}
          value={value.cctvCount}
          onChange={(e) => onChange({ ...value, cctvCount: e.target.value })}
        />
      </div>
      <div className="col-span-2 space-y-1.5">
        {accessLabel("Access Control")}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {ACCESS_CONTROL_OPTIONS.map((opt) => (
            <label
              key={opt}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={value.accessControl.includes(opt)}
                onChange={() => toggleAccess(opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        {accessLabel("ระบบดับเพลิง")}
        <select
          className={selectCls}
          value={value.fireSuppression}
          onChange={(e) => onChange({ ...value, fireSuppression: e.target.value })}
        >
          {FIRE_SUPPRESSION_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {shortOptionLabel(o)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        {accessLabel("Smoke Detector")}
        <select
          className={selectCls}
          value={value.vesda}
          onChange={(e) => onChange({ ...value, vesda: e.target.value })}
        >
          {SMOKE_DETECTOR_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {shortOptionLabel(o)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}