"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type AnyElement = React.ReactElement<Record<string, unknown>>

function asElement(node: React.ReactNode): AnyElement | null {
  return React.isValidElement(node) ? (node as AnyElement) : null
}

function childrenOf(element: AnyElement): React.ReactNode {
  return element.props.children as React.ReactNode
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  const element = asElement(node)
  return element ? textOf(childrenOf(element)) : ""
}

function headerLabels(children: React.ReactNode): string[] {
  const labels: string[] = []
  React.Children.forEach(children, (section) => {
    const head = asElement(section)
    if (!head || head.type !== TableHeader) return
    React.Children.forEach(childrenOf(head), (row) => {
      const headRow = asElement(row)
      if (!headRow || headRow.type !== TableRow) return
      React.Children.forEach(childrenOf(headRow), (cell) => {
        const headCell = asElement(cell)
        if (!headCell || headCell.type !== TableHead) return
        labels.push(textOf(childrenOf(headCell)).trim())
      })
    })
  })
  return labels
}

function labelRow(row: AnyElement, labels: string[]): AnyElement {
  let index = 0
  const cells = React.Children.map(childrenOf(row), (cell) => {
    const tableCell = asElement(cell)
    if (!tableCell || tableCell.type !== TableCell) return cell
    const props = tableCell.props as React.ComponentProps<"td"> & {
      "data-label"?: string
    }
    if (Number(props.colSpan ?? 1) > 1) return cell
    const label = labels[index] ?? ""
    index += 1
    if (label === "" || props["data-label"] === label) return cell
    return React.cloneElement(tableCell, { "data-label": label })
  })
  return React.cloneElement(row, {}, cells)
}

function applyCellLabels(children: React.ReactNode, labels: string[]): React.ReactNode {
  if (labels.length === 0) return children
  return React.Children.map(children, (section) => {
    const body = asElement(section)
    if (!body || body.type !== TableBody) return section
    const rows = React.Children.map(childrenOf(body), (row) => {
      const tableRow = asElement(row)
      if (!tableRow || tableRow.type !== TableRow) return row
      return labelRow(tableRow, labels)
    })
    return React.cloneElement(body, {}, rows)
  })
}

function Table({ className, children, ...props }: React.ComponentProps<"table">) {
  const labels = headerLabels(children)
  return (
    <div data-slot="table-wrapper" className="w-full">
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto md:rounded-lg md:border"
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        >
          {applyCellLabels(children, labels)}
        </table>
      </div>
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-12 px-3 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

type TableCellProps = React.ComponentProps<"td"> & {
  "data-card-title"?: boolean
}

function TableCell({ className, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
