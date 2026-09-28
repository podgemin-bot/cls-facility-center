// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SecurityForm,
  securityFormFromData,
  type SecurityFormValue,
} from "./security-form";

function emptyValue(): SecurityFormValue {
  return {
    cctvCount: "",
    accessControl: [],
    fireSuppression: "ไม่ติดตั้ง",
    vesda: "ไม่ติดตั้ง",
  };
}

function Harness({ initial }: { initial: SecurityFormValue }) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <SecurityForm value={value} onChange={setValue} />
      <output data-testid="snapshot">{JSON.stringify(value)}</output>
    </div>
  );
}

function snapshot(container: HTMLElement): SecurityFormValue {
  const out = container.querySelector<HTMLElement>('[data-testid="snapshot"]')!;
  return JSON.parse(out.textContent!) as SecurityFormValue;
}

describe("SecurityForm", () => {
  it("renders every access-control option as a checkbox", () => {
    render(<Harness initial={emptyValue()} />);
    for (const opt of [
      "RFID Proximity Card",
      "PIN Code",
      "Biometric (Facial + Fingerprint)",
      "Key",
    ]) {
      expect(screen.getByLabelText(opt)).toBeInTheDocument();
    }
  });

  it("toggles access control checkboxes", () => {
    const { container } = render(<Harness initial={emptyValue()} />);
    fireEvent.click(screen.getByLabelText("RFID Proximity Card"));
    expect(snapshot(container).accessControl).toEqual(["RFID Proximity Card"]);
    fireEvent.click(screen.getByLabelText("PIN Code"));
    expect(snapshot(container).accessControl).toEqual([
      "RFID Proximity Card",
      "PIN Code",
    ]);
    fireEvent.click(screen.getByLabelText("RFID Proximity Card"));
    expect(snapshot(container).accessControl).toEqual(["PIN Code"]);
  });

  it("reflects pre-selected access control as checked", () => {
    const selected: SecurityFormValue = {
      ...emptyValue(),
      accessControl: ["Key", "PIN Code"],
    };
    render(<Harness initial={selected} />);
    expect(screen.getByLabelText("Key")).toBeChecked();
    expect(screen.getByLabelText("PIN Code")).toBeChecked();
    expect(screen.getByLabelText("Biometric (Facial + Fingerprint)")).not.toBeChecked();
  });

  it("updates the CCTV count", () => {
    const { container } = render(<Harness initial={emptyValue()} />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "12" } });
    expect(snapshot(container).cctvCount).toBe("12");
  });

  it("updates fire suppression selection", () => {
    const { container } = render(<Harness initial={emptyValue()} />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], {
      target: { value: "FM-200 (HFC-227ea)" },
    });
    expect(snapshot(container).fireSuppression).toBe("FM-200 (HFC-227ea)");
  });

  it("updates smoke detector selection and keeps other values", () => {
    const initial: SecurityFormValue = {
      cctvCount: "4",
      accessControl: ["Key"],
      fireSuppression: "CO2 Clean Agent System",
      vesda: "ไม่ติดตั้ง",
    };
    const { container } = render(<Harness initial={initial} />);
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1], { target: { value: "VESDA" } });
    const next = snapshot(container);
    expect(next.vesda).toBe("VESDA");
    expect(next.cctvCount).toBe("4");
    expect(next.accessControl).toEqual(["Key"]);
    expect(next.fireSuppression).toBe("CO2 Clean Agent System");
  });

  it("shows short labels (no parenthesised brand) for suppression options", () => {
    render(<Harness initial={emptyValue()} />);
    expect(screen.getByRole("option", { name: "FM-200" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Novec 1230" })).toBeInTheDocument();
  });
});

describe("securityFormFromData", () => {
  it("defaults an empty security record", () => {
    expect(securityFormFromData(null)).toEqual({
      cctvCount: "",
      accessControl: [],
      fireSuppression: "ไม่ติดตั้ง",
      vesda: "ไม่ติดตั้ง",
    });
  });

  it("maps stored data into form values", () => {
    expect(
      securityFormFromData({
        cctvCount: 8,
        accessControl: "RFID Proximity Card, Key",
        fireSuppression: "FM-200 (HFC-227ea)",
        vesda: "VESDA",
      })
    ).toEqual({
      cctvCount: "8",
      accessControl: ["RFID Proximity Card", "Key"],
      fireSuppression: "FM-200 (HFC-227ea)",
      vesda: "VESDA",
    });
  });
});