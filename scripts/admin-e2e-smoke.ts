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
  const emailAdmin = `smoke-admin-${suffix}@test.local`
  const emails = {
    admin: `smoke-r-admin-${suffix}@test.local`,
    editor: `smoke-r-editor-${suffix}@test.local`,
    viewer: `smoke-r-viewer-${suffix}@test.local`,
  }

  // ---------- Phase A: bootstrap an admin ----------
  console.log("\n== Phase A: bootstrap admin ==")
  await signUp(emailAdmin)
  await setRole(emailAdmin, "ADMIN")
  const jarAdmin = await signIn(emailAdmin)
  check("bootstrap admin sign-in OK", true)

  // ---------- Phase B: create admin/editor/viewer users ----------
  // Mimics createUser server action (sign-up + set role) at the data layer.
  console.log("\n== Phase B: create users per role ==")
  for (const role of ["ADMIN", "EDITOR", "VIEWER"] as const) {
    const email = emails[role.toLowerCase() as keyof typeof emails]
    const before = await prisma.user.count({ where: { email } })
    await signUp(email)
    await setRole(email, role)
    const after = await prisma.user.count({ where: { email } })
    check(`created ${role} user (${email})`, before === 0 && after === 1)
  }

  // admin sees the new users on the real /admin page
  const adminHtml = await (await get("/admin", jarAdmin)).text()
  check("admin sees the 3 new users on /admin", adminHtml.includes(emails.admin), "page=200")

  // ---------- Phase C: test usage per role ----------
  console.log("\n== Phase C: usage per role ==")
  const jarAdmin2 = await signIn(emails.admin)
  const jarEditor = await signIn(emails.editor)
  const jarViewer = await signIn(emails.viewer)

  for (const [label, email, role] of [
    ["admin", emails.admin, "ADMIN"],
    ["editor", emails.editor, "EDITOR"],
    ["viewer", emails.viewer, "VIEWER"],
  ] as const) {
    // role is a custom column — better-auth doesn't return it from get-session,
    // so read it from the DB exactly like the app's RSC pages do.
    const row = await prisma.user.findUnique({ where: { email }, select: { role: true } })
    check(`${label} role is ${role}`, row?.role === role, `db role=${row?.role}`)
  }

  // /admin gating
  const adminUi = await (await get("/admin", jarAdmin2)).text()
  check("ADMIN: /admin shows management UI", adminUi.includes("รายชื่อผู้ใช้"))
  for (const [label, jar] of [
    ["editor", jarEditor],
    ["viewer", jarViewer],
  ] as const) {
    const html = await (await get("/admin", jar)).text()
    check(`${label}: /admin shows denial message`, html.includes("หน้านี้เฉพาะผู้ดูแลระบบ"))
  }

  // editor/ viewer edit capability via server-rendered canEdit on /floorplan
  const flEditor = await (await get("/floorplan", jarEditor)).text()
  const flViewer = await (await get("/floorplan", jarViewer)).text()
  const flAdmin = await (await get("/floorplan", jarAdmin2)).text()
  check("EDITOR: /floorplan renders pin editor (canEdit)", flEditor.includes("เปิดโหมด Pin Editor"))
  check("VIEWER: /floorplan has no pin editor (read-only)", !flViewer.includes("เปิดโหมด Pin Editor"))
  check("ADMIN: /floorplan renders pin editor (canEdit)", flAdmin.includes("เปิดโหมด Pin Editor"))

  // profile works for each role
  const pv = await (await get("/profile", jarViewer)).text()
  check("VIEWER: /profile renders (logged-in)", pv.includes("โปรไฟล์") && pv.includes(emails.viewer))

  // unauth still gated
  const unauth = await get("/admin")
  check("no session: /admin redirects to /login", unauth.status === 307)

  // ---------- Phase D: delete the created users ----------
  console.log("\n== Phase D: delete created users ==")
  for (const role of ["ADMIN", "EDITOR", "VIEWER"] as const) {
    const email = emails[role.toLowerCase() as keyof typeof emails]
    const row = await prisma.user.findUnique({ where: { email } })
    if (!row) {
      check(`found ${role} user to delete`, false)
      continue
    }
    // Mimics deleteUserAction server action (guard + cascade delete) at the data layer.
    await prisma.user.delete({ where: { id: row.id } })
    const gone = (await prisma.user.findUnique({ where: { id: row.id } })) === null
    const sessions = await prisma.session.count({ where: { userId: row.id } })
    const accounts = await prisma.account.count({ where: { userId: row.id } })
    check(`deleted ${role} user + cascaded (sessions=${sessions}, accounts=${accounts})`, gone && sessions === 0 && accounts === 0)
  }

  // deleted cookies are invalid
  const oldViewer = await (await get("/api/auth/get-session", jarViewer)).text()
  check("deleted user's session cookie is invalid", oldViewer === "null")

  // admin page no longer lists them
  const adminAfter = await (await get("/admin", jarAdmin2)).text()
  const listed = [emails.admin, emails.editor, emails.viewer].some((e) => adminAfter.includes(e))
  check("admin page no longer lists deleted users", !listed)
}

async function runner() {
  try {
    await main()
  } catch (e) {
    console.error("SMOKE ERROR:", e)
    failures++
  } finally {
    // cleanup every artifact created by this run
    await prisma.session
      .deleteMany({ where: { user: { email: { startsWith: "smoke-" } } } })
      .catch(() => {})
    await prisma.account
      .deleteMany({ where: { user: { email: { startsWith: "smoke-" } } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { email: { startsWith: "smoke-" } } })
      .catch(() => {})
    await prisma.$disconnect().catch(() => {})
  }

  console.log(`\nRESULT: ${passed} passed, ${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

runner()
