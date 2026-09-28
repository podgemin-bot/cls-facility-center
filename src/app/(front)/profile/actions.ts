"use server"

import { headers } from "next/headers"
import { refresh } from "next/cache"
import { auth } from "@/lib/auth"

export type ProfileActionResult = { ok: boolean; error?: string }

async function requireSession(token: string): Promise<string | null> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null)
  if (!session?.user?.id) return "unauthorized"
  if (token === session.session?.token) return "cannot-revoke-current"
  return null
}

export async function revokeSessionAction(token: string): Promise<ProfileActionResult> {
  const denied = await requireSession(token)
  if (denied) return { ok: false, error: denied }

  try {
    await auth.api.revokeSession({ headers: await headers(), body: { token } })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}

export async function revokeOtherSessionsAction(): Promise<ProfileActionResult> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null)
  if (!session?.user?.id) return { ok: false, error: "unauthorized" }

  try {
    await auth.api.revokeOtherSessions({ headers: await headers() })
    refresh()
    return { ok: true }
  } catch {
    return { ok: false, error: "server-error" }
  }
}