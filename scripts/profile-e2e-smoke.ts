import "dotenv/config"
import { randomInt } from "node:crypto"
import prisma from "../src/lib/prisma"
import { auth } from "../src/lib/auth"

const BASE = "http://localhost:3000"

let failures = 0
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  —  ${extra}` : ""}`)
  if (!ok) failures++
}

function jar() {
  const map = new Map<string, string>()
  return {
    map,
    cookie: () => [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
  }
}

function applySetCookie(res: Response, j: ReturnType<typeof jar>) {
  const sc = res.headers.getSetCookie?.() ?? []
  for (const c of sc) {
    const m = /^([^=]+)=([^;]*)/.exec(c)
    if (m) j.map.set(m[1], m[2])
  }
}

async function post(uri: string, body: unknown, j?: ReturnType<typeof jar>) {
  const res = await fetch(BASE + uri, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE,
      ...(j ? { cookie: j.cookie() } : {}),
    },
    body: JSON.stringify(body),
    redirect: "manual",
  })
  if (j) applySetCookie(res, j)
  return res
}

async function get(uri: string, j?: ReturnType<typeof jar>) {
  return fetch(BASE + uri, {
    method: "GET",
    headers: {
      origin: BASE,
      ...(j ? { cookie: j.cookie() } : {}),
    },
    redirect: "manual",
  })
}

async function cleanup() {
  await prisma.account.deleteMany({
    where: { user: { OR: [{ email }, { email: { startsWith: "probe" } }] } },
  })
  await prisma.session.deleteMany({
    where: { user: { OR: [{ email }, { email: { startsWith: "probe" } }] } },
  })
  await prisma.user.deleteMany({
    where: { OR: [{ email }, { email: { startsWith: "probe" } }] },
  })
  await prisma.$disconnect()
}

async function main() {
  // 1. unauth /profile must redirect to /login
  const unauth = await get("/profile")
  check("GET /profile ไม่มี session → redirect /login", unauth.status === 307, `status=${unauth.status}`)
  const loc = unauth.headers.get("location") ?? ""
  check("redirect location ชี้ไป /login", /\/login/.test(loc), loc)

  // 2. provision account through the trusted server API; public sign-up is disabled
  const signup = await auth.api.signUpEmail({ body: { email, password, name: "Smoke User" } })
  check("account provisioned", Boolean(signup?.user?.id))

  // 3. sign in device A
  const jarA = jar()
  const signA = await post("/api/auth/sign-in/email", { email, password, callbackURL: "/" }, jarA)
  check("sign-in OK", signA.status === 200, `status=${signA.status}`)

  // 4. /profile with session renders the profile UI
  const profile = await get("/profile", jarA)
  const html = await profile.text()
  check("GET /profile (auth) → 200", profile.status === 200, `status=${profile.status}`)
  check("หน้าโปรไฟล์มี 'โปรไฟล์'", html.includes("โปรไฟล์"))
  check("มี section 'อุปกรณ์ที่เข้าใช้งาน'", html.includes("อุปกรณ์ที่เข้าใช้งาน"))
  check("มี Badge 'อุปกรณ์นี้'", html.includes("อุปกรณ์นี้"))
  check("แสดงอีเมลผู้ใช้", html.includes(email))

  // 5. list-sessions with A
  const list1 = await get("/api/auth/list-sessions", jarA)
  const s1 = (await list1.json()) as { token: string }[]
  check("list-sessions 1 device → มี >=1 session", Array.isArray(s1) && s1.length >= 1, `count=${s1?.length}`)

  // 6. sign in device B, then list again
  const jarB = jar()
  const signB = await post("/api/auth/sign-in/email", { email, password, callbackURL: "/" }, jarB)
  check("sign-in device B OK", signB.status === 200)
  const list2 = await get("/api/auth/list-sessions", jarA)
  const s2 = (await list2.json()) as { token: string }[]
  check("list-sessions 2 devices → 2 sessions", Array.isArray(s2) && s2.length === 2, `count=${s2?.length}`)

  // 7. revoke others from A
  const rev = await post("/api/auth/revoke-other-sessions", {}, jarA)
  const revBody = (await rev.json()) as unknown
  check("revoke-other-sessions OK", rev.status === 200 && Boolean(revBody), `status=${rev.status}`)

  const list3 = await get("/api/auth/list-sessions", jarA)
  const s3 = (await list3.json()) as { token: string }[]
  check("เหลือ session เดียวหลัง revoke", Array.isArray(s3) && s3.length === 1, `count=${s3?.length}`)

  // 8. device B session is now invalid (get-session → null; /profile → 307)
  const gsB = await get("/api/auth/get-session", jarB)
  const gsBText = await gsB.text()
  check("session B ถูก revoke → get-session เป็น null", gsBText === "null", `body=${gsBText.slice(0, 60)}`)
  const profileB = await get("/profile", jarB)
  check("GET /profile (session B) → redirect /login", profileB.status === 307, `status=${profileB.status}`)

  // 9. page still rendered after refresh (device A alive)
  const profile2 = await get("/profile", jarA)
  const html2 = await profile2.text()
  check("GET /profile (ยัง valid) → 200", profile2.status === 200 && html2.includes("อุปกรณ์นี้"))
}

const email = `smoke-${Date.now()}-${randomInt(1000)}@test.local`
const password = "SmokePass123!"

async function runner() {
  try {
    await main()
  } catch (e) {
    console.error("SMOKE ERROR:", e)
    failures++
  } finally {
    try {
      await cleanup()
    } catch (e) {
      console.error("CLEANUP ERROR:", e)
      failures++
    }
  }

  console.log(failures === 0 ? "ALL GREEN" : `FAILURES=${failures}`)
  process.exit(failures === 0 ? 0 : 1)
}

runner()
