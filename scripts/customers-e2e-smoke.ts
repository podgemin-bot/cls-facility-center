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
  const emailEditor = `smoke-c-editor-${suffix}@test.local`
  const emailViewer = `smoke-c-viewer-${suffix}@test.local`
  const smokeCode = `CUST-SMK-${suffix}`.slice(0, 20)
  const smokeName = `Smoke Test Co ${suffix}`
  const smokePosition = `Smoke Position ${suffix}`

  // ---------- Phase A: create editor + viewer users ----------
  console.log("\n== Phase A: create users ==")
  await signUp(emailEditor)
  await setRole(emailEditor, "EDITOR")
  await signUp(emailViewer)
  await setRole(emailViewer, "VIEWER")
  check("created EDITOR + VIEWER users", true)

  const jarEditor = await signIn(emailEditor)
  const jarViewer = await signIn(emailViewer)
  check("signed in as EDITOR (session cookie set)", jarEditor.cookie().includes("better-auth"))

  // ---------- Phase B: /customers per role ----------
  console.log("\n== Phase B: /customers page usage ==")
  const editorHtml = await (await get("/customers", jarEditor)).text()
  check("EDITOR: /customers renders (200 + list)", editorHtml.includes("ลูกค้า") && editorHtml.includes("ดูข้อมูล"))
  check("EDITOR: add/edit/delete buttons rendered (canEdit)", editorHtml.includes("เพิ่มลูกค้า") && editorHtml.includes('aria-label="แก้ไข"') && editorHtml.includes('aria-label="ลบ"'))

  const viewerHtml = await (await get("/customers", jarViewer)).text()
  check("VIEWER: /customers renders read-only list", viewerHtml.includes("ลูกค้า") && viewerHtml.includes("ดูข้อมูล"))
  // column header "ดู / แก้ไข" is always rendered — assert on the gated buttons (aria-label only rendered when canEdit)
  check("VIEWER: no edit/delete buttons", !viewerHtml.includes('aria-label="แก้ไข"') && !viewerHtml.includes('aria-label="ลบ"') && !viewerHtml.includes("เพิ่มลูกค้า"))

  const guestRes = await get("/customers")
  check("guest: /customers redirects to /login (protected)", guestRes.status === 307 && (guestRes.headers.get("location") ?? "").includes("/login?callbackURL=%2Fcustomers"))

  // ---------- Phase C: real data path (row created in DB shows on the page) ----------
  console.log("\n== Phase C: data path ==")
  const created = await prisma.customer.create({
    data: {
      code: smokeCode,
      name: smokeName,
      stage: "INQUIRY",
      contactName: "Smoke Contact",
      contactPosition: smokePosition,
      contactPhone: "099-000-0000",
      contactEmail: `smoke-${suffix}@test.local`,
      inquiryDate: new Date(),
    },
  })
  check("created temp customer in DB", created.id > 0, smokeCode)

  const afterHtml = await (await get("/customers", jarEditor)).text()
  check(
    "EDITOR: new customer contact fields visible in list",
    afterHtml.includes(smokeName) && afterHtml.includes(smokePosition)
  )

  // cleanup the temp customer here (also covered by finally below)
  await prisma.customer.delete({ where: { id: created.id } })
  const gone = (await prisma.customer.findUnique({ where: { id: created.id } })) === null
  check("temp customer cleaned up", gone)

  // ---------- Phase D: delete the created users ----------
  console.log("\n== Phase D: delete users ==")
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
    await prisma.customer
      .deleteMany({ where: { code: { startsWith: "CUST-SMK-" } } })
      .catch(() => {})
    await prisma.session
      .deleteMany({ where: { user: { email: { startsWith: "smoke-c-" } } } })
      .catch(() => {})
    await prisma.account
      .deleteMany({ where: { user: { email: { startsWith: "smoke-c-" } } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { email: { startsWith: "smoke-c-" } } })
      .catch(() => {})
    await prisma.$disconnect().catch(() => {})
  }

  console.log(`\nRESULT: ${passed} passed, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

runner()
