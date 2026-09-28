// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

describe("Table", () => {
  it("labels every body cell from its column header", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อบริษัท</TableHead>
            <TableHead>เบอร์โทร</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>National Telecom</TableCell>
            <TableCell>081-111-1111</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    const cells = screen.getAllByRole("cell")
    expect(cells.map((cell) => cell.dataset.label)).toEqual([
      "ชื่อบริษัท",
      "เบอร์โทร",
    ])
  })

  it("keeps the header labels aligned when a column is conditional", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อห้อง</TableHead>
            {false && <TableHead>ไม่ควรอยู่</TableHead>}
            <TableHead>สถานะ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>PKB-F1-R01</TableCell>
            <TableCell>ห้องหลัก</TableCell>
            <TableCell>ว่าง</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    const cells = screen.getAllByRole("cell")
    expect(cells.map((cell) => cell.dataset.label)).toEqual([
      "รหัส",
      "ชื่อห้อง",
      "สถานะ",
    ])
  })

  it("marks the card title cell and leaves spanning cells unlabelled", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อห้อง</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={2}>ไม่พบข้อมูล</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-mono">PKB-F1-R01</TableCell>
            <TableCell data-card-title>ห้องหลัก</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    const empty = screen.getByText("ไม่พบข้อมูล")
    expect(empty.dataset.label).toBeUndefined()

    const title = screen.getByText("ห้องหลัก")
    expect(title.dataset.cardTitle).toBe("true")
    expect(title.dataset.label).toBe("ชื่อห้อง")
  })

  it("leaves action cells unlabelled when the header cell is blank", () => {
    render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>PKB-F1-R01</TableCell>
            <TableCell>ดูรายละเอียด</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )

    const cells = screen.getAllByRole("cell")
    expect(cells.map((cell) => cell.dataset.label)).toEqual(["รหัส", undefined])
  })
})
