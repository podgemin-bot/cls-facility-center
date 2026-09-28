# Handoff — CLS Facility Center (nextjs-ai-nt-2-main)

Thai cable-landing-station (CLS) facility center web app for NT (ประจำสถานีปากบารา/สงขลา). Repo: `https://github.com/podgemin-bot/cls-database` (origin/main).

## Stack
- **Next.js 16.3.1 (App Router, Turbopack)** · React 19 · TypeScript 5
- **Prisma 7 + MariaDB driver adapter** (`prisma/schema.prisma`, `prisma.config.ts`, `@prisma/adapter-mariadb`) — **ไม่ใช้ `@prisma/client` ตัว CJS** ต้อง import ผ่าน path alias/tsx/Next
- **better-auth 1.7** (email/password, DB session) — client `src/lib/auth-client.ts`, server `src/lib/auth.ts`
- **Tailwind CSS 4** + shadcn/radix-ui · react-hook-form + zod · lucide-react · xlsx
- **Vitest 4** (tests), **tsx** (ts scripts)
- **`next.config.ts`**: `output: "standalone"` + **`cacheComponents: true`**

## วิธีรัน
```powershell
npm.cmd run dev            # dev server (ต้องใช้ npm.cmd/npx.cmd — .ps1 โดน execution policy บล็อก)
npm.cmd test               # vitest run ทั้งหมด (26 files / 267 tests)
npx.cmd tsc --noEmit       # typecheck
npx.cmd eslint             # lint
npm.cmd run db:push        # อัปเดต schema ไป DB
npm.cmd run db:deploy      # apply migrations
npx.cmd prisma generate    # หลังแก้ schema
```

## Environment
- `.env`: `DATABASE_URL` (MariaDB, `mysql://` prefix ใช้ได้กับ Prisma แต่ driver mariadb ตรง ๆ ต้อง `mariadb://`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:3000`
- `.env.production.example` — ต้นแบบ production env (DB/auth)
- `.gitignore` ครอบ `dev.log`/`dev.err.log`/`deploy.*.log`/`.env*` แล้ว

## Production deployment decision (2026-09-27)
- **มติสุดท้าย: ไม่ใช้ Docker** — เก็บ `Dockerfile`/entrypoint ไว้เป็นทางเลือก แต่ไม่ต้องทดสอบหรือใช้ใน production รอบนี้
- **Host ที่เหมาะที่สุดกับโค้ดปัจจุบัน:** Oracle Cloud Always Free VM (Ampere A1 ARM64, Ubuntu, 2 OCPU / 12 GB RAM ภายใน free quota)
- **Runtime:** Node.js 22.12+ + `npm run start` ภายใต้ `systemd`; build บน ARM64 VM โดยตรง ห้าม copy `.next`/`node_modules` จาก Windows x64
- **Database:** MariaDB บน VM เดียวกัน, bind เฉพาะ `127.0.0.1`, ใช้ database user แยกจาก root และไม่เปิด port 3306 สู่อินเทอร์เน็ต
- **HTTPS:** เริ่มด้วย DuckDNS + Caddy; เมื่อมีโดเมนองค์กรให้ย้าย DNS ไป Cloudflare Free เพื่อใช้ DNS/CDN/WAF แล้วเปลี่ยน `BETTER_AUTH_URL` เป็น canonical HTTPS URL
- **Source/CI:** GitHub **Private** + GitHub Actions สำหรับ test/typecheck/lint/build-check แล้ว SSH ไปสั่ง deploy; ตัว production build ต้องสร้างบน ARM64 VM
- **Runtime photos:** ย้ายออกจาก Git ไป persistent path เช่น `/srv/cls-data/photos`; ห้ามพึ่ง writable `public/` ใน release directory
- **Backup:** dump MariaDB + รูปทุกวันไป private OCI Object Storage พร้อม retention และทดสอบ restore
- **เหตุผล:** VM รักษา Next.js SSR/Server Actions, Better Auth, Prisma/MariaDB และ filesystem behavior ได้ใกล้ local/mockup ที่สุดโดยแก้ backend น้อยกว่า serverless
- **ไม่เลือก GitHub Pages/Cloudflare Pages:** เป็น static hosting จึงรัน auth, Prisma, CRUD, Server Actions และ uploads ไม่ได้
- **ไม่เลือก Cloudflare Workers:** ต้อง migrate ไป vinext (ยัง beta), R2 และ D1/Hyperdrive; Workers Free จำกัด CPU 10 ms และ RAM 128 MB ซึ่งเสี่ยงกับ SSR/auth
- **ไม่เลือก Vercel Hobby:** จำกัด non-commercial personal use; ต้องใช้ external DB + Blob และ payload ของ Function จำกัด 4.5 MB (ระบบอนุญาตรูป 10 MB)
- **ข้อจำกัด:** Always Free ไม่มี SLA, capacity อาจเต็มและ resource อาจถูก reclaim; ถ้าต้องการ availability รับประกัน ให้ย้ายสถาปัตยกรรมเดิมไป VPS แบบเสียเงินแทนการ rewrite ไป Pages/serverless

## Security blockers before public deployment
- **เร่งด่วน: repository ปัจจุบันตรวจแล้วเป็น Public** และมี Excel export ฐานข้อมูล รวมถึง `public/storage` 144 ไฟล์ประมาณ 45 MiB — ให้ถือว่าข้อมูล/รูปที่เคย commit อาจถูกเข้าถึงจากภายนอกแล้ว
- ก่อน deploy ต้องเปลี่ยน repo เป็น Private และแนะนำสร้าง private repo ใหม่แบบ clean history โดยไม่ใส่ Excel, DB dump, รูปจริง, `.env` หรือ secret; การลบจาก commit ล่าสุดอย่างเดียวไม่ลบจาก Git history
- ตรวจ/หมุน credentials และ `BETTER_AUTH_SECRET`; ล้างบัญชี test/UAT ก่อนย้าย DB จริง
- `src/proxy.ts` ตรวจเพียงว่ามี cookie ชื่อ `better-auth.session_token` ไม่ได้ validate session — cookie ปลอมอาจผ่าน proxy แล้วอ่านหน้าข้อมูลที่ไม่ได้ reject session ซ้ำ
- HTTPS production ใช้ secure cookie prefix (`__Secure-better-auth.session_token`) แต่ proxy ยังตรวจเฉพาะชื่อ non-secure
- `(front)/layout.tsx` ยังไม่ enforce session จริง; ต้อง validate ผ่าน `auth.api.getSession()` แล้ว redirect ก่อน render ทุก protected page (proxy ใช้เป็น optimization เท่านั้น ไม่ใช่ security boundary)
- `/signup` ยัง public และบัญชีใหม่เป็น VIEWER ซึ่งอ่านข้อมูลสถานี/ลูกค้าได้ — production ต้องปิด signup และให้ ADMIN สร้างบัญชี
- ไฟล์ใน `public/storage` เปิดตรงโดยไม่ผ่าน auth และอยู่ใน Git — ต้องย้าย runtime photos ไป persistent private storage และส่งผ่าน authenticated route
- upload action อนุญาต 10 MiB แต่ Next Server Actions ยังใช้ default body limit; ต้องกำหนด limit ให้ตรงกันและตรวจ MIME/file signature ไม่ใช่ extension อย่างเดียว
- upload รองรับ `.webp` แต่ page enumeration เดิมอ่านเฉพาะ JPG/JPEG/PNG — ต้องทำให้ extension ที่ upload กับ list ตรงกัน
- migration `20260919084724_drop_room_security_columns` อ้าง `roomsecurity` ตัวเล็ก แต่ตารางเริ่มต้นคือ `RoomSecurity`; ต้องแก้และทดสอบ fresh MariaDB บน Linux case-sensitive
- query options ใน `.env.production.example` ใช้ `connection_limit`/`pool_timeout`; MariaDB driver ใช้ `connectionLimit`/`acquireTimeout` — ต้องแก้ก่อน production เพื่อไม่ให้ pool default 10 connections ต่อ process โดยไม่ตั้งใจ
- `src/lib/auth.ts` ตั้ง logger เป็น `debug` ทุก environment; production ต้องลดระดับ log และตั้ง trusted origin/proxy headers ให้ตรง public HTTPS URL
- ห้ามรัน `scripts/import.ts` อัตโนมัติระหว่าง deploy เพราะลบ facility records และ `public/storage`; ใช้ dump/restore สำหรับข้อมูล production

## Auth & Protected routes
- `src/proxy.ts` — middleware guard: redirect 307 → `/login?callbackURL=…`; login/signup กลับ redirect ไป `/` ถ้ามี session แล้ว
- Protected: `/`, `/rooms`, `/locations`, `/floorplan`, `/engineering`, `/customers`, `/profile`, `/admin`
- Role: `ADMIN` / `EDITOR` / `VIEWER` (field `user.role`) — ADMIN/EDITOR แก้ข้อมูลได้, VIEWER อ่านอย่างเดียว
- Session cookie: `better-auth.session_token=<token>.<signature>` — **signed cookie** (HMAC ด้วย `BETTER_AUTH_SECRET`) ค่า raw token ใน DB ใช้ตรง ๆ ไม่ได้ ต้องเอามาจาก `auth.api.*` + `returnHeaders: true`

## Pages (src/app/(front))
| Route | ฟีเจอร์ |
|---|---|
| `/` | Dashboard |
| `/rooms` | Room CRUD + security fields + photo upload/delete |
| `/locations` | Hierarchical CRUD site/building/floor/room + auto-code |
| `/floorplan` | Floor plan pins, room dialog + photo lightbox, filters |
| `/engineering` | Power/AC/certificate/security tabs + AssetDialog/SecurityEditDialog/CertDialog |
| `/profile` | แก้ชื่อ / เปลี่ยนรหัสผ่าน / จัดการ session |
| `/customers` | ข้อมูลบริษัท/ผู้ติดต่อ: ตำแหน่ง โทรศัพท์ อีเมล หมายเหตุ และ search |
| `/admin` | User/role management (search/filter/delete-user) |
| `/login` `/signup` | auth (public, กลับ redirect เมื่อ logged in แล้ว) |

## Data model (prisma/schema.prisma)
- `User`, `Session`, `Account` (better-auth) + field `role`
- `Customer` — code, name, stage, contactName/contactPosition/contactPhone/contactEmail, note, interestedRooms Json, inquiryDate, contract info
- `CodeSequence` — counter table (`prefix` PK, `lastValue`) สำหรับออกรหัส `CUST-xxx` ไม่ reuse
- CLS data: sites/buildings/floors/rooms + engineering (asset/certificate) + security columns
- Migration ล่าสุด: `20260926000000_add_code_sequence`

## Testing (คำสั่ง: `npm.cmd test` — 26 files / 267 tests)
Tests ระดับ integration ใช้ DB จริง (mock auth ผ่าน `vi.mock`; สร้าง temp user + cleanup เอง):
- `src/proxy.test.ts` — unit guard proxy
- `src/*-crud.test.ts` — rooms / customers / engineering / locations / admin (DB integration)
- `src/profile-auth.test.ts`, `src/profile-actions.test.ts` — better-auth / actions จริง
- `src/lib/*.test.ts` — unit: cls, profile schemas/errors
- `src/app/(front)/*/**/*.test.tsx` — component tests (jsdom) ทุกหน้า: dashboard, rooms, locations, floorplan, engineering, customers, profile, admin
- `src/components/*.test.tsx`, `src/components/ui/table.test.tsx` — lightbox, security-form, navbar, nav-menu, navigation-sheet, logout-button, table cell labels (card layout)
- `vitest.config.ts` alias `@` → `src`; jsdom env ต่อไฟล์ด้วย pragma `// @vitest-environment jsdom`
- Smoke/e2e scripts (`scripts/*-smoke.ts`) รันยิง dev server ผ่าน better-auth HTTP — ใช้เป็น final check หลังแก้เรื่อง auth/route
- `scripts/uat-card-layout.ts` — UAT card layout ผ่าน playwright-core + Chrome headless (ต้องรัน dev server ก่อน; screenshot ลง `%TEMP%\opencode\uat`)

## ประวัติที่ทำ (session ใหม่ล่าสุดอยู่บนสุด)
1. **feat(ui): ตารางเป็น card layout บนมือถือ (แทน scroll hint) + `router.refresh()` หลัง create user / เปลี่ยนรหัสผ่าน**
    - **`src/components/ui/table.tsx`** — `Table` อ่านหัวคอลัมน์จาก `TableHeader` แล้ว clone ใส่ `data-label` ให้ทุก `td` ใน `tbody` (ข้าม cell ที่ `colSpan > 1`; cell ที่หัวคอลัมน์ว่างเช่นคอลัมน์ action → ไม่ใส่ label)
      - รองรับหัวคอลัมน์ conditional (`{canEdit && <TableHead/>}`) เพราะ `React.Children` ข้าม child ที่เป็น `false` → index ของ head กับ cell ยังตรงกัน
      - `data-card-title` บน cell หลัก (ชื่อห้อง/ชื่อบริษัท/ชื่อผู้ใช้) เพื่อให้ CSS ยกไว้บนสุดของการ์ด
      - ถอด scroll hint "ปัดซ้าย-ขวา…" ออก และย้าย border/rounded จาก page → `table-container` (`md:` เท่านั้น) เพื่อให้ทุกหน้าใช้ card layout ได้โดยไม่ต้องแก้ business page
    - **`src/app/globals.css`** — `@media (width < 48rem)` ทำให้ `table/tbody/tr/td` เป็น block, ซ่อน `thead`, `td` เป็น flex label(ซ้าย)/value(ขวา) ผ่าน `td::before { content: attr(data-label) }`; cell ที่ไม่มี label (action) ชิดขวา, แถวที่มี cell เดียว (empty state) จัดกลาง
      - กติกาชุดนี้อยู่นอก `@layer` ของ Tailwind จึง override utility (`p-3`, `whitespace-nowrap`, `text-right`) ได้โดยไม่ต้องแตะ class ในแต่ละหน้า
    - **Business pages** — ถอด `<div className="overflow-x-auto rounded-lg border">` ออกทุกหน้า (rooms, customers, locations, engineering 4 ตาราง, admin) และใส่ `data-card-title` ที่ cell ชื่อ
    - **fix(admin/profile): `router.refresh()` หลัง create user / เปลี่ยนรหัสผ่าน** — เดิมข้อมูลใหม่ไม่โผล่ในตารางจนกว่าจะ reload หน้า (pattern เดียวกับที่แก้ rooms/locations/customers/engineering/floorplan แล้ว)
    - **fix(scripts): `dash()` ใน `export-database.ts` คืนค่า `unknown`** → `tsc --noEmit` เคย error ที่ HEAD (`TS2322`) ตอนนี้ผ่าน
    - **`.gitignore` ที่ repo root** — dev server เขียน log ไว้ที่ root (`dev.log`, `dev.err.log`) ซึ่ง `.gitignore` ใน `nextjs-ai-nt-2-main/` ครอบไม่ถึง → เพิ่ม pattern ไว้ให้ `git status` สะอาด
    - Verification: full Vitest **26 files / 267 tests**, `tsc --noEmit`, ESLint (0 error), `npm run build` ผ่าน, และ UAT `scripts/uat-card-layout.ts` **92/92** ที่ 390px + 1280px ทั้ง 5 หน้า
      - mobile: `thead` ซ่อน, `tr` เป็น block, มี card title ทุกแถว, `td::before` แสดง label ตรงกับหัวคอลัมน์ทุกช่อง, จำนวน cell ตรงกับหัวคอลัมน์, ไม่มี horizontal scroll ของทั้งหน้าและ container
      - desktop: `thead` ยังเห็น, `tr` เป็น `table-row`, ไม่มี horizontal scroll
      - admin: สร้างผู้ใช้ผ่านฟอร์ม → success alert + แถวใหม่โผล่หลัง soft refresh (window marker ยังรอด = ไม่ hard reload)
2. **Customer code counter + engineering BTU + Dockerfile fix (session ก่อนหน้า — commit `cbd8175`, `7ff03a1`, `064cfdc`)**
    - **fix(customers): รหัส `CUST-xxx` ไม่ reuse อีกต่อไป** (`cbd8175`)
      - `nextCode()` เดิมอ่านรหัสสูงสุดที่คุณอยู่แล้ว +1 → ลบ `CUST-006` แล้วรหัสถูกใช้ซ้ำ; เปลี่ยนเป็น counter table `CodeSequence` (`prefix` PK, `lastValue`) increment ใน transaction
      - ใช้ `updateMany({increment})` ไม่ใช่ `upsert` — concurrent upsert บน row เดียว fail ด้วย MariaDB error 1020 (ตรวจรีล 24/24 concurrent allocations distinct)
      - migration `20260926000000_add_code_sequence` seed ค่า `CUST` จาก MAX รหัสที่มีอยู่ + `scripts/seed-customers.ts` ปรับ counter ให้สูงสุดเท่ารหัสที่ seed (ไม่ล่ะ fresh DB จะออก `CUST-001` ซ้ำตอนแรก)
      - **fix latent bug:** migration `20260925123705` อ้าง `customer` (lowercase) แต่ table จริงคือ `Customer` — ใช้งานได้บน Windows (case-insensitive) แต่ `migrate deploy` บน Linux/Docker จะ fail →แก้เป็น `Customer`
      - verification: fresh DB รีล — migrate deploy 5 migrations + seed + counter = 5 → create ถัดไป `CUST-006`; full Vitest 26 files / 262 tests, `tsc --noEmit`, ESLint
    - **feat(engineering): คอลั่น BTU + form ช่อง BTU ใส่ค่า** (`7ff03a1`)
      - คอลั่น BTU ใน cooling tab แสดงแค่ตัวเลข (เช่น `242,800` จาก `"242,800 BTU x2"`)
      - ข้อมูลที่ import มาไม่มี `specs.btu` (มีแค่ `btuTotal`) → คำนวณ per-unit = `btuTotal / unitsTotal` แสดงแทน; form เพิ่ม/แก้ไขก็ auto-fill ช่อง BTU ด้วยค่าเดียวกัน
      - verification: engineering component 17 tests, full Vitest 26 files / 264 tests, `tsc --noEmit`, ESLint
    - **fix(deploy): Dockerfile copy `prisma.config.ts`** (`064cfdc`)
      - entrypoint รัน `migrate deploy --schema=prisma/schema.prisma` แต่ runner image ไม่มี `prisma.config.ts` → boot fail "datasource.url property is required" (Prisma 7) — ตรวจรีล: รันตัว CLI โดยไม่มี config fail, มีแล้ว pass
      - **ตรวจ production standalone รีล** (ยังไม่ docker build): `npm run build` ผ่าน (12 routes + proxy), รัน `server.js` standalone → `/login` 200, `/api/auth/get-session` 200 (DB path ทำงานใน bundle)
      - **Docker build จริงยังไม่ทำ** — เครื่องนี้ไม่มี Docker ติดตั้ง
    - **export file ฐานข้อมูล Excel ให้ตรงกับ web** (`e3f7bf0`)
      - สร้าง `CLS from AGY/CLS_Master_Database.xlsx` ใหม่ (Original อยู่ครบ) — 9 ชิ้น, ลบคอลั่นที่ web ไม่ใช้ (เช่น แรงดันก๊าซ/ชนิดกลอนประตู/จำนวนถังก๊าซใน sheet ความปลอดภัย, Username/สถานะใช้การใน sheet ผู้ใช้, ชิ้น Audit Trail ทั้งชิ้น), ชื่อคอลั่นไทยตรง label web, สถานะ/ขั้นตอนเป็นค่าไทยที่ web แสดง
      - ข้อมูล export จาก MariaDB จริง (ตรงกับที่ web แสดง) + รัน `scripts/seed-customers.ts` อีกครั้งเพื่อถม `contactPosition` ที่ว่างอยู่ในลูกค้าทั้ง 5
      - สคริปต์ซ้ำได้: `npx.cmd tsx scripts/export-database.ts` — อัปเดต Excel จาก DB ทุกครั้งที่ข้อมูลเปลี่ยน
      - หมายเหตุ: sheet 9 มี 10 บัญชีรวม test/UAT (test-admin@, uat-hydr-flow-*) ตามที่ web แสดง; X/Y หมุดผังว่าง = ตรงกับ web (หมุดไม่เคยมีพิกัดใน Excel เดิม, วางผ่าน Pin Editor)
    - หมายเหตุ: counter `CUST` ใน dev DB ถูกขยับไป ~40 จาก concurrency test (รหัสที่ใช้จริง `CUST-001..005` — ลูกค้าใหม่จะได้รหัสที่มีช่องว่าง เช่น `CUST-04x`)
3. **Customer contact fields + simplified form** (commit `afeaf1b`)
   - ตารางลูกค้าเหลือคอลัมน์ ชื่อบริษัท, ผู้ติดต่อ, ตำแหน่งลูกค้า, เบอร์โทร, อีเมล, หมายเหตุ และ action
   - เพิ่ม `Customer.contactPosition` แบบ nullable พร้อม migration `20260925123705_add_customer_contact_position`; apply กับ local MariaDB และ `prisma generate` แล้ว
   - ฟอร์มเพิ่ม/แก้ไขถอดขั้นตอน, วันที่สอบถาม, ห้องที่สนใจ และข้อมูลสัญญาออก; action ไม่เขียนฟิลด์เหล่านี้เพื่อรักษาข้อมูล workflow เดิม
   - search ครอบคลุมบริษัท ผู้ติดต่อ ตำแหน่ง โทรศัพท์ อีเมล และหมายเหตุ
   - Verification อัตโนมัติ: customer component + DB integration 17 tests, full Vitest 26 files / 260 tests, `tsc --noEmit`, ESLint และ customer smoke 12/12 ผ่าน
   - Chrome headless UAT รอบสุดท้าย (viewport 1440×1000, login EDITOR ผ่าน UI) ผ่าน:
     - header ตรงตาม 6 คอลัมน์ข้อมูล + action และฟอร์มไม่มี 4 ช่องที่ถูกถอดออก
     - เพิ่มลูกค้าผ่านฟอร์มและเห็นครบทุกฟิลด์ในตาราง; DB สร้าง `CUST-006`, `stage=INQUIRY` และข้อมูลตรงทุก field
     - ลบผ่าน confirm → แถวหายจากหน้าและ DB ใน ~385ms; server action ~21ms
     - ไม่พบ console error, JavaScript runtime error หรือ `dev.err.log`; ลบลูกค้า/บัญชี UAT ครบและไม่มี Chrome headless ค้าง
4. **Responsive / accessibility / mobile table UX** (commit `da2727f`)
   - **แก้ navbar ล้นจอช่วง tablet**: เปลี่ยน desktop navigation จาก `md` เป็น `xl`, แสดง hamburger ถึงก่อน `xl`, ใส่ `shrink-0` ให้ control group/logo และจำกัดชื่อผู้ใช้ด้วย `max-w-48 truncate`
   - **เพิ่ม accessible name ให้ hamburger**: `aria-label="เปิดเมนูนำทาง"`; test เปลี่ยนมา query ด้วย role/name จริง
   - **แก้ profile ล้นแนวนอนเมื่อข้อมูลยาว**: ใส่ `min-w-0` ให้ grid columns/session content, email ใช้ `break-all`, session metadata ใช้ `break-words`; เพิ่ม test email ยาว
   - **เพิ่มคำแนะนำตารางมือถือส่วนกลาง** ใน `src/components/ui/table.tsx`: "ปัดซ้าย-ขวาเพื่อดูข้อมูลเพิ่มเติม" แสดงเฉพาะก่อน `md`; ครอบทุกตารางโดยไม่แก้ business pages ซ้ำ และเพิ่ม `table.test.tsx`
   - **แก้ favicon 404 บน auth pages**: ย้าย `src/app/(front)/favicon.ico` ไป `src/app/favicon.ico` ตาม Next.js 16 app icon convention
   - **Verification ผ่านทั้งหมด**:
     - targeted tests 4 files / 26 tests
     - full Vitest **26 files / 260 tests**, `tsc --noEmit`, ESLint
     - `npm.cmd run build` ผ่าน: compile ~1.2s, TypeScript ~5.1s, static generation 13/13
     - Chrome headless UAT ผ่านที่ 390/768/1024/1280/1440px: document overflow=0 ทุกขนาด; hamburger แสดงที่ <=1024 และซ่อนที่ >=1280
     - profile ที่ 390px overflow=0; rooms scroll hint แสดงและ table scroll 356→1084px; `/favicon.ico`=200; console/network errors=0
   - Dev server restart หลัง build แล้ว: `http://localhost:3000` ตอบ 200
5. **Production-readiness + UAT ครอบทุกหน้า** (commit `c93a3ab`)
   - **`npm run build` ผ่าน** (standalone + `cacheComponents`) — compile 19.7s (cold) / 1.6s (warm), 12 routes + proxy
   - **fix(floorplan): `router.refresh()` หลัง `savePin`** — floorplan ยังใช้ pattern เก่า (server `refresh()` + `startTransition`, ไม่มี client refresh) → ใส่ `useRouter` + `router.refresh()` หลัง pin วางสำเร็จใน `floorplan-client.tsx` (ระบุไม่ใช้แล้ว `photoPoint` mutation ค้างแบบเดียวกับ engineering) + mock `next/navigation` + ยืนยัน refresh ใน `floorplan-client.test.tsx`
   - **UAT UI ครอบหน้าที่เหลือ 12/12 ผ่าน 2 รอบซ้ำ** (playwright-core + Chrome headless):
     - floorplan (EDITOR): Pin Editor → เลือกห้อง → คลิกวาง pin → หมุดโผล่ ~200–265ms ไม่ค้าง, DB `photoPoint` เปลี่ยนจริง (x=39.91,y=29.9), restore ค่าเดิม, view-mode คลิกหมุดเปิด dialog
     - admin (ADMIN): create user ผ่านฟอร์ม → row โผล่ ~1.2s, role=EDITOR, DB จริง; delete → confirm "ยืนยันการลบ" → row + DB หาย
     - profile (ADMIN): เปลี่ยนชื่อ → success ~1.3s + DB อัปเดต + restore; revoke "ออกจากระบบอุปกรณ์อื่นทั้งหมด" → sessions 2→1, session อุปกรณ์ B invalid จริง
   - **ทบทวน hydration warning**: เจอตอน UAT ก่อนหน้าแบบชั่วคราว แต่ post-hoc probes (ทุกหน้าโหลด + flow save/refresh ผ่าน console capture) **reproduce ไม่ได้** — สรุปเป็น dev-only transient noise (Turbopack + cacheComponents), ไม่ใช่ code bug
6. **fix(rooms/locations/customers): client `router.refresh()` หลัง actions** (commit `a116452`)
   - เทียบกับ fix ครั้งก่อนของ engineering — ย้ายไปใช้ `router.refresh()` ฝั่ง client หลัง action สำเร็จ (เก็บ server `refresh()` ใน actions ไว้)
   - `rooms-client.tsx`: refresh หลัง save / upload photo / delete photo
   - `locations-client.tsx`: ย้าย `runAction` เข้า client component + `router.refresh()` เมื่อสำเร็จ
   - `customers-client.tsx`: refresh หลัง save dialog + delete
   - เพิ่ม mock `next/navigation` + ยืนยันการเรียก refresh ใน 3 ไฟล์ test
   - **ยืนยันด้วย UAT จริง** (playwright-core + Chrome headless, login EDITOR ผ่าน UI): ผ่าน 2 รอบซ้ำ **11/11**
     - rooms: save แสดง success ใน ~400–450ms ไม่ค้าง "Rendering", DB อัปเดตจริง
     - locations: create site → dialog ปิด ~320–350ms, row `UAT-*` ใน DB + render ขึ้นหน้า, delete มีผลจริง
     - customers: create → dialog ปิด ~330–415ms, DB + render + delete ผ่าน
7. **fix(engineering): stuck-on-save hang** (commit `c834e14`)
   - อาการ: หน้า Power System แก้ไขอุปกรณ์ → กดบันทึก → ค้างที่ indicator "Rendering"
   - สาเหตุ: actions เรียก `refresh()` → Next.js embed re-render หน้านี้ (หนักมาก) ใน action response; client transition ไม่ settle — ตรงกับ known issue (#88767/#86055) เมื่อ `cacheComponents` + Turbopack
   - แก้: mirror pattern ของ admin/profile — เรียก `router.refresh()` ฝั่ง client **หลัง** action สำเร็จในทุกจุด (deleteAsset/deleteCertificate + save ทุก dialog — Asset/Security/Cert) `engineering-client.tsx`
   - เพิ่ม mock `next/navigation` ใน `engineering-client.test.tsx`
   - **ยืนยันด้วย UAT จริง** (playwright-core + Chrome headless, login เป็น EDITOR → แก้ไขชื่ออุปกรณ์ → บันทึก): dialog ปิดใน ~330ms, ไม่มี "Rendering" ค้าง, DB เปลี่ยนจริง
8. **feat(auth): protect /customers** (commit `b52799f`) — เพิ่ม `/customers` ใน `PROTECTED_PREFIXES` ของ proxy
9. **Docker/deploy prep** (commit `c834e14` รวมไว้):
   - `Dockerfile` — standalone multi-stage + prisma engines/schema + `docker-entrypoint.sh` (run `migrate deploy` ก่อน start)
   - `docker-entrypoint.sh`, `scripts/deploy.ps1` (build/run script), `.env.production.example`
   - `.dockerignore` ย่อเหลือ minimum

## งานค้าง / โน้ต
- **Docker ไม่ใช่งานค้างแล้ว** — ตัดสินใจไม่ใช้ Docker; เก็บไฟล์ deploy เดิมไว้เป็น fallback เท่านั้น
- **Production deployment ยังไม่ได้เริ่ม** — เป้าหมายคือ Oracle Always Free VM + Node.js/systemd + MariaDB + Caddy ตามหัวข้อ Production deployment decision
- **Security blockers ด้านบนต้องแก้ครบก่อนเปิด Public URL** โดยเฉพาะ repo Public, session validation, public signup และ public photos
- **Prisma 7 CLI:** `migrate deploy` ต้องมี `prisma.config.ts` (datasource url) — schema.prisma อย่างเดียวไม่พอ; `migrate diff --from-migrations` ต้องมี `shadowDatabaseUrl` ใน config (flags เก่า `--to-schema-datamodel`/`--shadow-database-url` ถูกลบแล้ว) — ใช้ `--from-config-datasource --to-schema ...` ตรวจ drift กับ DB จริงแทน
- **counter `CUST` ใน dev DB มีช่องว่าง** (~40) จาก concurrency test — รหัสลูกค้าใหม่จะโดด เช่น `CUST-04x`; รีเซ็ตได้โดย `UPDATE CodeSequence SET lastValue = 5 WHERE prefix = 'CUST'` (ทำได้ก็ต่อเมื่อยืนยันว่ารหัส 6-4x ไม่ได้ใช้กับข้อมูลจริง)
- ถ้าหน้าอื่นเจอค้างแบบเดียวกัน (action เรียก `refresh()` แต่ client ไม่ `router.refresh()`) → ใช้ fix เดียวกับ engineering/floorplan; ตอนนี้ครบคือ rooms/locations/customers/engineering/floorplan/admin (create user) profile (เปลี่ยนรหัสผ่าน)
- **Hydration warning ใน dev**: เป็นครั้งคราว ชั่วคราว กับ `cacheComponents` + Turbopack — reproduce ไม่ได้ใน post-hoc probes, มี element `nextjs-portal` (ของ Next dev tools, ปกติ) จะเบลอถ้าเล่น UAT ผ่าน `[role="dialog"]` ทั่วไป ให้ key ที่ title ของ dialog จริงแทน
- **UAT ผ่าน UI (playwright)** ต้องระวัง hydration race:
  - `.fill()` ก่อน React hydrated → controlled state ยังเป็นค่าว่าง → หลัง hydrate มัน reset ค่า → submit แล้วเจอ validation error (เช่น "รหัสผ่านขั้นต่ำ 8 ตัว") → ให้ refill+settle ~400ms ก่อน click ทุกครั้ง และ retry วนใหม่
  - login/dialog-open: click ได้แต่ไม่มีผล (handler ยังไม่ attached) → ควร retry + รอ signal จริงของ form (เช่น `[role="dialog"] input` ครบจำนวน)
  - ปุ่ม revoke-all ของ profile เป็น **inline expansion** (ปุ่ม "ยืนยัน" ใน CardFooter) ไม่ใช่ Radix AlertDialog — ไม่มี `role="dialog"`
  - "ออกจากระบบอุปกรณ์อื่นทั้งหมด" จะแสดงเฉพาะเมื่อหน้าโหลดแล้วมี `otherSessions>0` → ต้อง sign-in อุปกรณ์ที่ 2 **ก่อน** `goto /profile`
- Dev server รันอยู่ที่ http://localhost:3000 (restart หลัง schema/migration แล้ว; `/login` ตอบ 200, `dev.err.log` ว่าง; log: `dev.log`, `dev.err.log` ที่ **git root** ซึ่งตอนนี้ถูก ignore ด้วย `.gitignore` ที่ root แล้ว)
- **`Table` (`src/components/ui/table.tsx`) เป็นจุดเดียวที่กำหนดหน้าตาตารางบนมือถือ** — ถ้าเพิ่มตารางใหม่ให้ใช้ `Table` + `TableHeader` เสมอ และใส่ `data-label`/`data-card-title` เองได้ถ้าอยาก override; cell ที่หัวคอลัมน์ว่าง (คอลัมน์ action) จะไม่มี label บนการ์ดโดยอัตโนมัติ
- `scripts/` มีสคริปต์แนบครั้งเดียว (seed/backfill/normalize/smoke/import/uat) — รันซ้ำส่วนใหญ่ปลอดภัย (upsert)
- `playwright-core` อาจติดค้างใน `node_modules` (ติดตั้งแบบ `--no-save` จาก UAT) — ไม่ได้อยู่ใน `package.json`
- **สคริปต์ที่เปิด `prisma` + เขียน log ต้อง `process.exit()` ตอนจบ** — ถ้าไม่ exit process จะค้างที่ connection pool (เคยเจอกับ `uat-card-layout.ts` ที่พิมพ์สรุปแล้วแต่ process ไม่จบ)
- ตรวจ `git status` ให้สะอาดก่อนส่งต่องาน (log ที่ git root ถูก ignore แล้ว; ระวัง LibreOffice `~.lock` file ใน `CLS from AGY/`)
- `AGENTS.md` ของโปรเจกต์: Next.js เวอร์ชันนี้มี breaking changes — ต้องอ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด

## งานที่จะทำต่อ
1. **หยุดการเปิดเผยข้อมูลก่อน:** เปลี่ยน repo ปัจจุบันเป็น Private, สร้าง private repo แบบ clean history, เอา Excel/DB dump/รูปจริงออกจาก Git และ audit history ด้วย secret scanner; หากพบ secret ให้ rotate ทันที
2. **Harden auth:** enforce `auth.api.getSession()` ที่ protected layout, รองรับ secure cookie, ปิด production signup, ตั้ง trusted origins/proxy headers, ลด debug logging และเพิ่ม regression tests สำหรับ forged/missing/expired session
3. **Protect photos:** ย้ายรูปไป persistent private directory, สร้าง authenticated upload/list/read/delete flow, ทำ MIME/signature validation, ทำ WebP behavior ให้ตรงกัน และทดสอบว่ารูปอยู่หลัง restart/redeploy
4. **แก้ production portability:** แก้ `RoomSecurity` migration case, Server Action body limit, MariaDB pool options, pin Node 22.12+ และทดสอบ fresh `migrate deploy` บน Linux ARM64
5. **เตรียมข้อมูล production:** ล้าง test/UAT accounts, ยืนยัน `CodeSequence`, dump MariaDB แบบ transaction, สำรองรูป และสร้าง `BETTER_AUTH_SECRET` ใหม่
6. **Provision Oracle VM:** เลือก home region ใกล้ไทยที่มี A1 capacity, สร้าง Ubuntu ARM64 VM + persistent volume, ใช้ SSH key, firewall เปิดเฉพาะ 22/80/443 และติดตั้ง Node/MariaDB/Caddy/systemd
7. **Deploy แบบ release directory:** build บน ARM64, run migration ครั้งเดียวก่อนสลับ release, health-check `/login`, restart ผ่าน systemd และ rollback application release ถ้า health check ไม่ผ่าน (DB migration ต้อง backup ก่อนเพราะ rollback อัตโนมัติไม่ได้)
8. **ตั้ง GitHub Actions:** test 267 tests + typecheck + ESLint + build-check; เมื่อ main ผ่านจึง SSH ไปสั่ง deploy บน VM โดยไม่ส่ง Windows/x64 build artifacts
9. **ตั้ง URL/HTTPS:** เริ่ม DuckDNS + Caddy, ตั้ง `BETTER_AUTH_URL=https://...`; เมื่อได้โดเมนองค์กรค่อยย้าย DNS ไป Cloudflare และบังคับ canonical host
10. **Backup/monitoring:** dump DB + photos รายวันไป private OCI Object Storage, retention 7 daily/4 weekly, disk/service health alerts และทดสอบ restore จริง
11. **Production UAT ก่อน go-live:** ตรวจทุก route/role/CRUD/floorplan/photo, forged-cookie/public-file denial, HTTPS cookie, reboot persistence, ไม่มี port 3306 เปิด, mobile 390px + desktop 1280px และรัน `scripts/uat-card-layout.ts` ให้ผ่าน 92/92 บน URL จริง
12. (เมื่อมีหน้าใหม่) ถ้าเจอค้าง "Rendering" หลัง action → ใช้ `router.refresh()` client-side ตาม pattern ที่บันทึกไว้ข้างบน
