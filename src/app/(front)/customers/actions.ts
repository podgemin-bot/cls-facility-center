"use server"

import { headers } from "next/headers"
import { refresh } from "next/cache"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"

export type CustomerResult = { ok: boolean; error?: string }

async function requireEditor(): Promise<string | null> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null)
  if (!session?.user?.id) return "unauthorized"
  const user = await prisma.user
    .findUnique({ where: { id: session.user.id }, select: { role: true } })
    .catch(() => null)
  if (!user || (user.role !== "ADMIN" && user.role !== "EDITOR")) return "forbidden"
  return null
}

const strOrNull = (v: string): string | null => {
  const s = v.trim()
  return s ? s : null
}

const CUSTOMER_CODE_PREFIX = "CUST"

async function allocateCodeValue(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const bumped = await tx.codeSequence.updateMany({
      where: { prefix: CUSTOMER_CODE_PREFIX },
      data: { lastValue: { increment: 1 } },
    })
    if (bumped.count === 0) {
      const created = await tx.codeSequence.create({
        data: { prefix: CUSTOMER_CODE_PREFIX, lastValue: 1 },
      })
      return created.lastValue
    }
    const seq = await tx.codeSequence.findUniqueOrThrow({
      where: { prefix: CUSTOMER_CODE_PREFIX },
    })
    return seq.lastValue
  })
}

async function nextCode(): Promise<string> {
  let lastValue = 0
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      lastValue = await allocateCodeValue()
      break
    } catch (err) {
      if (attempt === 2) throw err
    }
  }
  return `${CUSTOMER_CODE_PREFIX}-${String(lastValue).padStart(3, "0")}`
}

export type CustomerInput = {
  id?: number
  name: string
  contactName: string
  contactPosition: string
  contactPhone: string
  contactEmail: string
  note: string
}

export async function createCustomer(input: CustomerInput): Promise<CustomerResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  const name = input.name.trim()
  const contactName = input.contactName.trim()
  const contactPhone = input.contactPhone.trim()

  if (!name || !contactName || !contactPhone) return { ok: false, error: "invalid-input" }

  try {
    const code = await nextCode()
    await prisma.customer.create({
      data: {
        code,
        name,
        contactName,
        contactPosition: strOrNull(input.contactPosition),
        contactPhone,
        contactEmail: strOrNull(input.contactEmail),
        note: strOrNull(input.note),
      },
    })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function updateCustomer(input: CustomerInput): Promise<CustomerResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }
  if (!input.id) return { ok: false, error: "invalid-input" }

  const name = input.name.trim()
  const contactName = input.contactName.trim()
  const contactPhone = input.contactPhone.trim()

  if (!name || !contactName || !contactPhone) return { ok: false, error: "invalid-input" }

  try {
    const existing = await prisma.customer.findUnique({ where: { id: input.id } })
    if (!existing) return { ok: false, error: "not-found" }

    await prisma.customer.update({
      where: { id: input.id },
      data: {
        name,
        contactName,
        contactPosition: strOrNull(input.contactPosition),
        contactPhone,
        contactEmail: strOrNull(input.contactEmail),
        note: strOrNull(input.note),
      },
    })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function deleteCustomer(id: number): Promise<CustomerResult> {
  const denied = await requireEditor()
  if (denied) return { ok: false, error: denied }

  try {
    const existing = await prisma.customer.findUnique({ where: { id } })
    if (!existing) return { ok: false, error: "not-found" }
    await prisma.customer.delete({ where: { id } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}
