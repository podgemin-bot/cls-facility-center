import "dotenv/config"
import { randomInt } from "node:crypto"
import { chromium } from "playwright-core"
import prisma from "../src/lib/prisma"

const BASE = "http://localhost:3000"
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
const PASSWORD = "UatPass123!"
const SHOTS = "C:/Users/PC/AppData/Local/Temp/opencode/uat"

let passed = 0
let failures = 0
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` :: ${extra}` : ""}`)
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

const uid = () => `${Date.now()}-${randomInt(10000)}`

type Metrics = {
  url: string
  tables: number
  rows: number
  theadHidden: boolean
  rowDisplay: string
  unlabelled: string[]
  misaligned: string[]
  renderedLabels: number
  cardTitles: number
  titleCount: number
  docOverflow: number
  containerOverflow: string
}

async function main() {
  const suffix = uid()
  const emailAdmin = `uat-admin-${suffix}@test.local`
  const emailEditor = `uat-editor-${suffix}@test.local`

  const su = await post("/api/auth/sign-up/email", {
    email: emailAdmin,
    password: PASSWORD,
    name: `uat-admin-${suffix}`,
  })
  check("sign-up admin", su.status === 200, String(su.status))
  await prisma.user.update({ where: { email: emailAdmin }, data: { role: "ADMIN", emailVerified: true } })

  const su2 = await post("/api/auth/sign-up/email", {
    email: emailEditor,
    password: PASSWORD,
    name: `uat-editor-${suffix}`,
  })
  check("sign-up editor", su2.status === 200, String(su2.status))
  await prisma.user.update({ where: { email: emailEditor }, data: { role: "EDITOR", emailVerified: true } })

  const jAdmin = jar()
  const rAdmin = await post("/api/auth/sign-in/email", { email: emailAdmin, password: PASSWORD, callbackURL: "/" }, jAdmin)
  check("sign-in admin", rAdmin.status === 200, String(rAdmin.status))
  const jEditor = jar()
  const rEditor = await post("/api/auth/sign-in/email", { email: emailEditor, password: PASSWORD, callbackURL: "/" }, jEditor)
  check("sign-in editor", rEditor.status === 200, String(rEditor.status))

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const pages = [
    { path: "/rooms", jar: jEditor },
    { path: "/customers", jar: jEditor },
    { path: "/locations", jar: jEditor },
    { path: "/engineering", jar: jEditor },
    { path: "/admin", jar: jAdmin },
  ]

  for (const vp of [
    { name: "mobile-390", width: 390, height: 844, mobile: true },
    { name: "desktop-1280", width: 1280, height: 900, mobile: false },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    for (const p of pages) {
      const cookies = [...p.jar.map.entries()].map(([name, value]) => ({
        name,
        value,
        domain: "localhost",
        path: "/",
      }))
      await ctx.addCookies(cookies)
      const page = await ctx.newPage()
      const res = await page.goto(BASE + p.path, { waitUntil: "networkidle", timeout: 60000 })
      const status = res?.status() ?? 0
      const metrics = (await page.evaluate(() => {
        const tables = [...document.querySelectorAll("table")]
        const out: Record<string, unknown> = {}
        let rows = 0
        let theadHidden = true
        let rowDisplay = ""
        const unlabelled: string[] = []
        const misaligned: string[] = []
        let renderedLabels = 0
        let cardTitles = 0
        let titleCount = 0
        for (const t of tables) {
          const th = t.querySelector("thead")
          if (th) {
            const cs = getComputedStyle(th)
            if (cs.display !== "none") theadHidden = false
          }
          const expected = [...t.querySelectorAll("thead th")].map((cell) => (cell.textContent ?? "").trim())
          const trs = [...t.querySelectorAll("tbody tr")]
          if (trs.length) {
            rowDisplay = getComputedStyle(trs[0]).display
            rows += trs.length
          }
          for (const tr of trs) {
            let index = 0
            for (const td of tr.querySelectorAll("td")) {
              const el = td as HTMLElement
              const span = Number(td.getAttribute("colspan") ?? "1")
              if (span > 1) continue
              const want = expected[index] ?? ""
              index += 1
              const label = el.getAttribute("data-label")
              if (el.getAttribute("data-card-title") !== null) {
                titleCount++
                if (want && label !== want) {
                  misaligned.push(`title cell want "${want}" got "${label ?? ""}"`)
                }
                continue
              }
              if (want && label !== want) {
                unlabelled.push(`${want} -> ${(el.textContent ?? "").slice(0, 18)} (got "${label ?? ""}")`)
              } else if (want) {
                const content = getComputedStyle(el, "::before").content
                if (content && content !== "none" && content.includes(want)) renderedLabels++
              }
            }
            if (index !== expected.length) {
              misaligned.push(`row has ${index} cells, header has ${expected.length}`)
            }
          }
          cardTitles += t.querySelectorAll("[data-card-title]").length
        }
        const container = document.querySelector("[data-slot='table-container']") as HTMLElement | null
        out.tables = tables.length
        out.rows = rows
        out.theadHidden = theadHidden
        out.rowDisplay = rowDisplay
        out.unlabelled = unlabelled
        out.misaligned = misaligned
        out.renderedLabels = renderedLabels
        out.cardTitles = cardTitles
        out.titleCount = titleCount
        out.docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth
        out.containerOverflow = container ? getComputedStyle(container).overflowX : "none"
        return out
      })) as unknown as Metrics

      const tag = `${vp.name} ${p.path}`
      check(`${tag} http 200`, status === 200, String(status))
      check(`${tag} has rows`, metrics.rows > 0, `rows=${metrics.rows}`)
      check(`${tag} labels match headers`, metrics.unlabelled.length === 0, metrics.unlabelled.slice(0, 4).join(" | "))
      check(`${tag} cell count matches header`, metrics.misaligned.length === 0, metrics.misaligned.slice(0, 4).join(" | "))
      if (vp.mobile) {
        check(`${tag} thead hidden`, metrics.theadHidden)
        check(`${tag} row is card`, metrics.rowDisplay === "block" || metrics.rowDisplay === "flex", metrics.rowDisplay)
        check(`${tag} card titles present`, metrics.titleCount > 0, `titles=${metrics.titleCount}`)
        check(`${tag} labels rendered on cards`, metrics.renderedLabels > 0, `labels=${metrics.renderedLabels}`)
        check(`${tag} no horizontal page scroll`, metrics.docOverflow <= 1, `overflow=${metrics.docOverflow}px`)
        check(`${tag} container not scrollable`, metrics.containerOverflow === "visible", metrics.containerOverflow)
      } else {
        check(`${tag} thead visible`, !metrics.theadHidden)
        check(`${tag} row is table-row`, metrics.rowDisplay === "table-row" || metrics.rowDisplay === "flex", metrics.rowDisplay)
        check(`${tag} no horizontal page scroll`, metrics.docOverflow <= 1, `overflow=${metrics.docOverflow}px`)
      }
      const file = `${SHOTS}/${vp.name}${p.path.replace(/\//g, "-")}.png`
      await page.screenshot({ path: file, fullPage: true })
      page.close()
    }
    await ctx.close()
  }

  // ---- admin createUser -> router.refresh (no hard reload) ----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([...jAdmin.map.entries()].map(([name, value]) => ({ name, value, domain: "localhost", path: "/" })))
  const page = await ctx.newPage()
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle", timeout: 60000 })
  const createdEmail = `uat-created-${suffix}@test.local`
  await page.evaluate(() => {
    ;(window as unknown as { __uat?: string }).__uat = "alive"
  })
  const rowsBefore = await page.locator("tbody tr").count()
  await page.fill("#form-admin-name", `UAT Created ${suffix}`)
  await page.fill("#form-admin-email", createdEmail)
  await page.fill("#form-admin-password", "UatCreated123!")
  await page.fill("#form-admin-confirm", "UatCreated123!")
  await page.selectOption('select[aria-label="เลือกสิทธิ์สำหรับสร้าง"]', "EDITOR")
  await page.click('button:has-text("สร้างผู้ใช้")')
  const successVisible = await page
    .locator('p[role="alert"]:has-text("สำเร็จ")')
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  check("admin createUser success alert", successVisible)
  await page
    .locator(`tbody tr:has-text("${createdEmail}")`)
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .catch(() => null)
  const rowsAfter = await page.locator("tbody tr").count()
  const marker = await page.evaluate(() => (window as unknown as { __uat?: string }).__uat)
  const newRow = await page.locator(`tbody tr:has-text("${createdEmail}")`).count()
  check("admin new row rendered after refresh", newRow > 0, `rows ${rowsBefore} -> ${rowsAfter}`)
  check("admin used soft refresh (no full reload)", marker === "alive", `marker=${String(marker)}`)
  await page.screenshot({ path: `${SHOTS}/admin-after-create.png`, fullPage: true })

  await browser.close()

  await prisma.user.deleteMany({ where: { email: { contains: `uat-` } } })
  console.log(`\n${passed} passed, ${failures} failed`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch(async (e) => {
  console.error("UAT crashed:", e)
  try {
    await prisma.user.deleteMany({ where: { email: { contains: "uat-" } } })
  } catch {}
  process.exit(1)
})
