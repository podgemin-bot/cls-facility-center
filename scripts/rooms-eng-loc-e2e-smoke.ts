import "dotenv/config"
import { randomInt } from "node:crypto"
import prisma from "../src/lib/prisma"
import { auth } from "../src/lib/auth"

const BASE = "http://localhost:3000"
const PASSWORD = "SmokePass123!"

let failures = 0
let passed = 0
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  —  ${extra}` : ""}`)
  if (ok) passed++
  else failures++
}

function jar() {
  const m = new Map<string, string>()
  return { map: m, cookie: () => [...m.entries()].map(([k, v]) => `${k}=${v}`).join("; ") }
}

function applySetCookie(res: Response, j: ReturnType<typeof jar>) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const m = /^([^=]+)=([^;]*)/.exec(c)
    if (m) j.map.set(m[1], m[2])
  }
}

async function post(uri: string, body: unknown, j?: ReturnType<typeof jar>) {
  const res = await fetch(BASE + uri, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...(j ? { cookie: j.cookie() } : {}) },
    body: JSON.stringify(body),
    redirect: "manual",
  })
  if (j) applySetCookie(res, j)
  return res
}

async function get(uri: string, j?: ReturnType<typeof jar>) {
  return fetch(BASE + uri, {
    method: "GET",
    headers: { origin: BASE, ...(j ? { cookie: j.cookie() } : {}) },
    redirect: "manual",
  })
}

async function signUp(email: string): Promise<void> {
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: email.split("@")[0] } })
}

async function signIn(email: string): Promise<ReturnType<typeof jar>> {
  const j = jar()
  const r = await post("/api/auth/sign-in/email", { email, password: PASSWORD, callbackURL: "/" }, j)
  if (r.status !== 200) throw new Error(`sign-in ${email} failed: ${r.status}`)
  const gs = await (await get("/api/auth/get-session", j)).json()
  if (gs?.user?.email !== email) throw new Error(`sign-in ${email} got wrong user`)
  return j
}

async function setRole(email: string, role: string): Promise<void> {
  await prisma.user.update({ where: { email }, data: { role } })
}

function uid() {
  return `${Date.now()}-${randomInt(10000)}`
}

async function main() {
  const suffix = uid()
  const emailEditor = `smoke-rle-editor-${suffix}@test.local`
  const emailViewer = `smoke-rle-viewer-${suffix}@test.local`

  // real-data markers straight from the DB used by the rendered pages
  const site = await prisma.site.findFirst({ orderBy: { code: "asc" } })
  const room = await prisma.room.findFirst({ orderBy: { code: "asc" } })
  const asset = await prisma.asset.findFirst({ orderBy: { code: "asc" } })
  if (!site || !room || !asset) throw new Error("no seed data for markers (site/room/asset)")

  // ---------- Phase A: create users ----------
  console.log("\n== Phase A: create users ==")
  await signUp(emailEditor)
  await setRole(emailEditor, "EDITOR")
  await signUp(emailViewer)
  await setRole(emailViewer, "VIEWER")
  const jarEditor = await signIn(emailEditor)
  const jarViewer = await signIn(emailViewer)
  check("created EDITOR + VIEWER and signed in", true)

  // ---------- Phase B: gating ----------
  console.log("\n== Phase B: protected routes (guest) ==")
  for (const path of ["/rooms", "/engineering", "/locations", "/floorplan", "/profile"]) {
    const r = await get(path)
    check(`guest GET ${path} -> 307`, r.status === 307)
  }

  // ---------- Phase C: rendering per role ----------
  console.log("\n== Phase C: /rooms ==")
  const roomsEd = await (await get("/rooms", jarEditor)).text()
  check("EDITOR: /rooms renders list (room code + ดูรายละเอียด + ในผลลัพธ์)", roomsEd.includes(room.code) && roomsEd.includes("ดูรายละเอียด") && roomsEd.includes("ในผลลัพธ์:"))
  const roomsVi = await (await get("/rooms", jarViewer)).text()
  check("VIEWER: /rooms renders same read-only list", roomsVi.includes(room.code) && roomsVi.includes("ดูรายละเอียด"))

  console.log("\n== Phase D: /engineering ==")
  const engEd = await (await get("/engineering", jarEditor)).text()
  check("EDITOR: /engineering renders + gated เพิ่ม Power button", engEd.includes("เพิ่ม Power") && engEd.includes(asset.code))
  const engVi = await (await get("/engineering", jarViewer)).text()
  check("VIEWER: /engineering read-only (no เพิ่ม Power, table still shows)", !engVi.includes("เพิ่ม Power") && engVi.includes(asset.code))

  console.log("\n== Phase E: /locations ==")
  const locEd = await (await get("/locations", jarEditor)).text()
  check("EDITOR: /locations renders site cards + gated เพิ่มสถานี", locEd.includes("เพิ่มสถานี") && locEd.includes(site.code))
  const locVi = await (await get("/locations", jarViewer)).text()
  check("VIEWER: /locations read-only (no เพิ่มสถานี, still shows site)", !locVi.includes("เพิ่มสถานี") && locVi.includes(site.code))

  // ---------- Phase F: cleanup ----------
  console.log("\n== Phase F: delete users ==")
  for (const email of [emailEditor, emailViewer]) {
    const row = await prisma.user.findUnique({ where: { email } })
    if (!row) {
      check(`found ${email}`, false)
      continue
    }
    await prisma.user.delete({ where: { id: row.id } })
    const goneUser = (await prisma.user.findUnique({ where: { id: row.id } })) === null
    const sessions = await prisma.session.count({ where: { userId: row.id } })
    const accounts = await prisma.account.count({ where: { userId: row.id } })
    check(`deleted ${email} + cascaded (sessions=${sessions}, accounts=${accounts})`, goneUser && sessions === 0 && accounts === 0)
  }
}

async function runner() {
  try {
    await main()
  } catch (e) {
    console.error("SMOKE ERROR:", e)
    failures++
  } finally {
    await prisma.session
      .deleteMany({ where: { user: { email: { startsWith: "smoke-rle-" } } } })
      .catch(() => {})
    await prisma.account
      .deleteMany({ where: { user: { email: { startsWith: "smoke-rle-" } } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { email: { startsWith: "smoke-rle-" } } })
      .catch(() => {})
    await prisma.$disconnect().catch(() => {})
  }

  console.log(`\nRESULT: ${passed} passed, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

runner()
