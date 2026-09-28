# Handoff — CLS Facility Center

Thai cable-landing-station (CLS) facility center web app for NT (ปากบารา/ปัตตานี PKB, สงขลา SKA).

**Repo: `https://github.com/podgemin-bot/cls-facility-center` (Private, clean history)**

## ที่มาของ repo นี้
- เดิมเป็น `podgemin-bot/cls-database` ซึ่งเคยเป็น Public และมีข้อมูลจริงใน history (Excel, `public/storage` 144 ไฟล์ ~45 MiB)
- Repo เดิมถูกเปลี่ยนเป็น Private แล้ว แต่ **ข้อมูลที่เคย commit ไปแล้วถือว่ารั่วแล้ว** — การลบจาก commit ล่าสุดไม่ลบออกจาก history
- Repo นี้ถูกสร้างใหม่จาก clean snapshot: ไม่มี `.env`, Excel, รูปจริง, DB dump, `public/storage`, dependencies, build output
- **ห้าม commit ต่อไป:** `.env`, `.data/`, `CLS from AGY/`, `*.xlsx`, `public/storage/`, build/cache/logs, `BETTER_AUTH_SECRET`, DB credentials

## Stack
- **Next.js 16.3.6 (App Router, Turbopack, Cache Components)** · React 19.2 · TypeScript 5
- **Prisma 7.10 + MariaDB driver adapter** (`@prisma/adapter-mariadb`) — ไม่ใช้ `@prisma/client` CJS ตัวตรง ๆ
- **better-auth 1.7** (email/password, DB session) — client `src/lib/auth-client.ts`, server `src/lib/auth.ts`
- **Tailwind CSS 4** + shadcn/radix-ui · react-hook-form + zod · lucide-react · xlsx
- **Vitest 4** (tests), **tsx** (ts scripts)
- `next.config.ts`: `output: "standalone"` (Docker fallback เท่านั้น) + `cacheComponents: true` + `experimental.serverActions.bodySizeLimit: "11mb"`
- **Node.js >= 22.12.0** (`.nvmrc`)

## วิธีรัน
```powershell
npm.cmd install
npm.cmd run dev            # dev server
npm.cmd test               # vitest run (31 files / 289 tests)
npx.cmd tsc --noEmit       # typecheck
npx.cmd eslint             # lint
npx.cmd prisma generate    # หลังแก้ schema
npm.cmd run db:push        # dev: sync schema
npm.cmd run db:deploy      # production: apply migrations
npm.cmd run db:verify-fresh # ทดสอบ migrate deploy บน DB ชั่วคราว 2 รอบ
npm.cmd run storage:migrate # ย้ายรูปเข้า private storage (ครั้งเดียว)
```

## Environment
- `.env` (ไม่ commit): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PRIVATE_STORAGE_ROOT`
- `.env.example` / `.env.production.example` เป็น template — MariaDB options ใช้ `connectionLimit` (ตัวเลข) และ `acquireTimeout` (มิลลิวินาที) ตาม driver
- `PRIVATE_STORAGE_ROOT` ต้องอยู่นอก `public/` และบน persistent storage ใน production (เช่น `/srv/cls-data`) — `getPrivateStorageRoot()` จะ throw ถ้าอยู่ใต้ `public/`
- `.gitignore` ครอบ `.env*`, `.data/`, `dev.log`, `dev.err.log`, `prod.*.log`, `deploy.*.log`, `.dev-server.pid`, `node_modules`, `.next`, `out`, `build`, `coverage` แล้ว

## Production deployment decision
- **มติสุดท้าย: ไม่ใช้ Docker** — เก็บ `Dockerfile`/`docker-entrypoint.sh` ไว้เป็น fallback เท่านั้น
- **Host:** Oracle Cloud Always Free VM (Ampere A1 ARM64, Ubuntu)
- **Runtime:** Node.js 22.12+ + `npm run start` ภายใต้ `systemd`; build บน ARM64 VM โดยตรง ห้าม copy `.next`/`node_modules` จาก Windows x64
- **Database:** MariaDB บน VM เดียวกัน, bind เฉพาะ `127.0.0.1`, ใช้ database user แยกจาก root, ไม่เปิด 3306 สู่อินเทอร์เน็ต
- **HTTPS:** DuckDNS + Caddy ก่อน; เมื่อมีโดเมนองค์กรย้าย DNS ไป Cloudflare Free แล้วเปลี่ยน `BETTER_AUTH_URL` เป็น canonical HTTPS URL
- **CI:** GitHub Actions สำหรับ test/typecheck/lint/build แล้ว SSH ไปสั่ง deploy
- **Backup:** dump MariaDB + รูปรายวันไป private OCI Object Storage พร้อม retention และทดสอบ restore
- **ข้อจำกัด:** Always Free ไม่มี SLA, capacity อาจเต็มและ resource อาจถูก reclaim; ถ้าต้องการ availability รับประกันให้ย้ายสถาปัตยกรรมไป VPS แบบเสียเงิน
- **ไม่เลือก:** GitHub Pages/Cloudflare Pages (static ไม่รัน auth/Prisma/Server Actions), Cloudflare Workers (ต้อง rewrite ไป vinext/R2/D1, Free จำกัด CPU/RAM), Vercel Hobby (non-commercial + payload 4.5 MB < ระบบอนุญาต 10 MB)

## Auth & Protected routes
- **Security boundary จริง:** `src/lib/auth-session.ts` → `getCurrentSession()` (React `cache`) และ `requireSession()` ที่ validate ผ่าน `auth.api.getSession()` แล้ว `redirect("/login")`
- `src/app/(front)/layout.tsx` เรียก `await requireSession()` ก่อน render → ทุก protected page ถูกบังคับ auth แม้ proxy ถูกข้าม
- `src/proxy.ts` เป็น **optimistic redirect เท่านั้น** — ใช้ `getSessionCookie()` จาก `better-auth/cookies` ซึ่งรองรับทั้ง `better-auth.session_token` และ `__Secure-better-auth.session_token`; ไม่ validate signature
- Protected: `/`, `/rooms`, `/locations`, `/floorplan`, `/engineering`, `/customers`, `/profile`, `/admin`
- **Public signup ปิดแล้ว:** `src/app/(auth)/signup/page.tsx` redirect ไป `/login`; `src/app/api/auth/[...all]/route.ts` บล็อก `POST /api/auth/sign-up/email` ด้วย `404` → ให้ ADMIN สร้างบัญชีผ่านหน้า `/admin`
- callbackURL sanitized: รับเฉพาะ path ที่ขึ้นต้น `/` และไม่ขึ้นต้น `//` (กัน open redirect ไป host อื่น)
- Role: `ADMIN` / `EDITOR` / `VIEWER` (field `user.role`)
- Session cookie เป็น **signed cookie** (HMAC ด้วย `BETTER_AUTH_SECRET`) ค่า raw token ใน DB ใช้ตรง ๆ ไม่ได้ ต้องเอาจาก `auth.api.*` + `returnHeaders: true`
- `src/lib/auth.ts` ตั้ง logger เป็น `warn` เมื่อ `NODE_ENV=production` (debug เฉพาะ dev)

## Private images
- `src/lib/private-images.ts` — ทุกรูปอยู่นอก `public/` ภายใต้ `PRIVATE_STORAGE_ROOT`
  - `room-photos/<roomId>/` และ `floor-plans/<floorId>/`
  - `MAX_PHOTO_BYTES = 10 * 1024 * 1024`
  - ตรวจทั้ง MIME ที่ browser ส่งมา, extension และ **magic bytes จริง** ของไฟล์ (JPEG `FF D8 FF`, PNG signature, RIFF/WEBP) — ไม่เชื่อ extension อย่างเดียว
  - `safeFilename()` กัน path traversal: ต้องเป็น basename, ไม่มี `..`, ความยาว ≤ 220, extension ต้องอยู่ใน allowlist
  - `fs.lstat` + กัน symlink ตอนอ่าน
  - เขียนแบบ atomic: `.tmp` + `flag: "wx"` + `rename`, mode `0o700` dir / `0o600` file
- **Authenticated routes** (ต้องผ่าน session):
  - `GET /api/rooms/[roomId]/photos/[filename]`
  - `GET /api/floors/[floorId]/plan/[filename]`
- เดิมรูปทั้งหมดถูกย้ายจาก `public/storage` เข้า `.data` แล้ว (144 ไฟล์, 47,129,538 bytes, checksum ผ่าน) และ `floorImage` ใน DB เก็บเป็นชื่อไฟล์แทน path
- `scripts/migrate-private-storage.ts` เป็น idempotent (รันซ้ำได้) — `--apply` เพื่อเขียนจริง
- DB เก็บแค่ชื่อไฟล์ ดังนั้นย้าย `PRIVATE_STORAGE_ROOT` ต้อง copy ไฟล์ตามไปด้วย

## Pages (src/app/(front))
| Route | ฟีเจอร์ |
|---|---|
| `/` | Dashboard |
| `/rooms` | Room CRUD + security fields + photo upload/delete |
| `/locations` | Hierarchical CRUD site/building/floor/room + auto-code |
| `/floorplan` | Floor plan pins, room dialog + photo lightbox, filters |
| `/engineering` | Power/AC/certificate/security tabs + AssetDialog/SecurityEditDialog/CertDialog |
| `/customers` | ข้อมูลบริษัท/ผู้ติดต่อ: ตำแหน่ง, โทรศัพท์, อีเมล, หมายเหต่า, search |
| `/profile` | แก้ชื่อ / เปลี่ยนรหัสผ่าน / จัดการ session |
| `/admin` | User/role management (ADMIN เท่านั้น) |
| `/login` | auth (public) |
| `/signup` | ปิดแล้ว — redirect ไป `/login` |

## Data model (prisma/schema.prisma)
- `User`, `Session`, `Account` (better-auth) + field `role`
- `Customer` — code, name, stage, contactName/contactPosition/contactPhone/contactEmail, note, interestedRooms Json, inquiryDate, contract info
- `CodeSequence` — counter table (`prefix` PK, `lastValue`) สำหรับออกรหัส `CUST-xxx` ไม่ reuse
- CLS data: sites/buildings/floors/rooms + engineering (asset/certificate) + security
- Migration ล่าสุด: `20260926000000_add_code_sequence` (5 migrations ทั้งหมด)

## Testing
`npm.cmd test` → **31 files / 289 tests** ผ่าน พร้อม `tsc --noEmit`, ESLint (0 error) และ `npm run build` (warning-free)

Tests ระดับ integration ใช้ DB จริง (mock auth ผ่าน `vi.mock`; สร้าง temp user + cleanup เอง) — **ระวังว่าจะ mutate ข้อมูลใน DB จริง**
- `src/proxy.test.ts` — proxy guard (มี both cookie names)
- `src/lib/auth-session.test.ts` — session validation + redirect
- `src/auth-route.test.ts` — signup block
- `src/lib/private-images.test.ts`, `src/private-image-routes.test.ts` — storage rules + auth บน image routes
- `src/*-crud.test.ts` — rooms / customers / engineering / locations / admin
- `src/profile-auth.test.ts`, `src/profile-actions.test.ts`, `src/profile-errors.test.ts`, `src/lib/profile-schemas.test.ts`
- `src/lib/cls.test.ts` — unit
- `src/app/(front)/**/*.test.tsx` — component tests (jsdom) ทุกหน้า
- `src/components/*.test.tsx`, `src/components/ui/table.test.tsx`
- `vitest.config.ts` alias `@` → `src` และ stub `server-only` ผ่าน `src/test/server-only.ts`; jsdom ต่อไฟล์ด้วย pragma `// @vitest-environment jsdom`
- `scripts/verify-fresh-migrations.ts` — สร้าง DB ชั่วคราว, `migrate deploy` 2 รอบ, ตรวจ 5 migrations + `RoomSecurity` casing + ไม่มี legacy columns แล้วลบทิ้ง

## ประวัติ security hardening (2026-09-28)
1. **Gitleaks scan:** history เดิม 41 commits พบ 1 placeholder ใน `.env.example` ไม่ตรงกับ `.env` local และไม่ใช่ secret จริง; clean snapshot scan ผ่าน ไม่พบ leak
2. **Repo เดิม → Private**, สร้าง clean private repo ใหม่, push `main`
3. **Auth hardening:** เพิ่ม `auth-session.ts`, enforce ที่ `(front)/layout.tsx`, secure-cookie support, ปิด signup, safe callbackURL, ลด production log เป็น `warn`
4. **Private images:** ย้าย 144 ไฟล์ออกจาก `public/`, เพิ่ม authenticated read routes, MIME + magic-byte validation, atomic write
5. **Portability:** แก้ `RoomSecurity` casing, `connectionLimit`/`acquireTimeout`, pin Node 22.12, เพิ่ม `db:verify-fresh`, อัปเดต README เป็น systemd-first
6. **Dependencies:** Next.js `16.3.1` → `16.3.6` (ปิด critical advisory), Prisma → `7.10.0`, เพิ่ม explicit `server-only` และ `playwright-core`

## งานค้าง / ความเสี่ยงที่เหลือ
- **ยังไม่ได้ทดสอบบน Linux ARM64 จริง** — `db:verify-fresh` ผ่านบน Windows local MariaDB ที่ `lower_case_table_names=1` เท่านั้น (สคริปต์จะบังคับตรวจ exact-case เมื่อค่าเป็น 0) ต้องรันซ้ำบน Ubuntu ARM64 ก่อน deploy
- **`npm audit` เหลือ 7 รายการ (1 moderate, 6 high)** จาก Prisma/MariaDB/MySQL2/xlsx ที่ยังไม่มี compatible fix — ต้องตัดสินใจว่าจะยอมรับหรือลด dependency
- **Production data ยังไม่ได้เตรียม:** ล้าง test/UAT accounts, ตรวจ `CodeSequence`, dump MariaDB แบบ transaction, สร้าง `BETTER_AUTH_SECRET` ใหม่ (`openssl rand -base64 32`)
- **ยังไม่ได้ provision Oracle VM** และยังไม่มี GitHub Actions workflow
- **การรั่วไหลในอดีตย้อนกลับไม่ได้** — ถือว่าข้อมูล/รูปที่เคยอยู่ใน public repo อาจถูกเข้าถึงแล้ว ควรพิจารณาหมุนข้อมูลที่เป็นความลับ

## โน้ตที่ยังใช้ได้
- **Prisma 7 CLI:** `migrate deploy` ต้องมี `prisma.config.ts` (datasource url) — `schema.prisma` อย่างเดียวไม่พอ; `migrate diff --from-migrations` ต้องมี `shadowDatabaseUrl` (flags เก่า `--to-schema-datamodel`/`--shadow-database-url` ถูกลบแล้ว) — ใช้ `--from-config-datasource --to-schema ...` ตรวจ drift แทน
- **`Table` (`src/components/ui/table.tsx`) เป็นจุดเดียวที่กำหนดหน้าตาตารางบนมือถือ** — ถ้าเพิ่มตารางใหม่ให้ใช้ `Table` + `TableHeader` สม่ำเสมอ; cell ที่หัวคอลัมน์ว่าง (คอลัมน์ action) จะไม่มี label บนการ์ดโดยอัตโนมัติ
- **ถ้าหน้าไหนค้างที่ "Rendering" หลัง action** ให้เรียก `router.refresh()` ฝั่ง client หลัง action สำเร็จ (pattern เดียวกับ engineering/floorplan/rooms/locations/customers/admin/profile) — ตอนนี้ครบทุกหน้าแล้ว
- **Hydration warning ใน dev** เป็น transient noise ของ `cacheComponents` + Turbopack — post-hoc probes reproduce ไม่ได้ ไม่ใช่ code bug
- **สคริปต์ใน `scripts/` ที่เปิด `prisma` ต้อง `process.exit()` ตอนจบ** ไม่งั้น process ค้างที่ connection pool
- `AGENTS.md`: Next.js เวอร์ชันนี้มี breaking changes — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด
- **counter `CUST` ใน dev DB มีช่องว่าง (~40)** จาก concurrency test — รหัสลูกค้าใหม่จะโดดเช่น `CUST-04x`; รีเซ็ตได้ด้วย `UPDATE CodeSequence SET lastValue = 5 WHERE prefix = 'CUST'` (เฉพาะเมื่อยืนยันว่ารหัส 6-4x ไม่ได้ใช้จริง)
- **ห้ามรัน `scripts/import.ts` อัตโนมัติระหว่าง deploy** เพราะลบ facility records และไฟล์รูป — ใช้ dump/restore สำหรับ production

## งานที่จะทำต่อ
1. Provision Oracle Always Free ARM64 VM: เลือก home region ใกล้ไทยที่มี A1 capacity, Ubuntu + SSH key + persistent volume, firewall เปิดเฉพาะ 22/80/443, ติดตั้ง Node 22.12 / MariaDB / Caddy / systemd
2. บน VM: `npm ci` → `npx prisma generate` → `npm run lint` → `npm test` → `npx tsc --noEmit` → `npm run build` → **`npm run db:verify-fresh`** (ต้องผ่านบน Linux case-sensitive)
3. เตรียม production data: ล้าง test/UAT accounts, ตรวจ `CodeSequence`, `mysqldump` แบบ transaction, copy private storage ไป `/srv/cls-data`, สร้าง `BETTER_AUTH_SECRET` ใหม่
4. Deploy แบบ release directory: build บน ARM64, `migrate deploy` ครั้งเดียวก่อนสลับ release, health-check `/login`, restart ผ่าน systemd, rollback ได้ (DB migration ต้อง backup ก่อน)
5. ตั้ง GitHub Actions: test + typecheck + ESLint + build; เมื่อ main ผ่านจึง SSH ไปสั่ง deploy โดยไม่ส่ง Windows/x64 artifacts
6. ตั้ง URL/HTTPS: DuckDNS + Caddy, ตั้ง `BETTER_AUTH_URL=https://...`; เมื่อได้โดเมนองค์กรค่อยย้าย DNS ไป Cloudflare และบังคับ canonical host
7. Backup/monitoring: dump DB + รูปรายวันไป private OCI Object Storage, retention 7 daily / 4 weekly, disk/service health alerts และทดสอบ restore จริง
8. Production UAT ก่อน go-live: ทุก route/role/CRUD/floorplan/photo, forged-cookie + public-file denial, HTTPS cookie, reboot persistence, ไม่มี port 3306 เปิด, mobile 390px + desktop 1280px
