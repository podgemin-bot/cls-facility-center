# Handoff — CLS Facility Center

Thai cable-landing-station (CLS) facility center web app for NT (ปากบารา/ปัตตานี PKB, สงขลา SKA).

**Repo ที่ใช้งานจริง: `https://github.com/podgemin-bot/cls-facility-center` (Private, clean history)**

> **สำคัญ:** repo นี้แยกจาก working directory บนเครื่อง
> - Clean repo (GitHub, push แล้ว): `C:\Users\PC\AppData\Local\Temp\opencode\cls-facility-center-clean`
> - Working copy ที่ใช้ dev อยู่: `E:\AI\Project\Opencode\CLS data collection\nextjs-ai-nt-2-main`
> - Working copy ยังเป็น git repo ของโปรเจกต์เก่า (`origin` = `podgemin-bot/cls-database`, Private) และ **ยังมีงาน uncommitted ทั้งหมดอยู่** — ใช้เป็น local dev เท่านั้น อย่า push กลับไปที่ `cls-database`
> - เวลาจะ commit ของใหม่ ให้ทำใน **clean repo**

## ที่มาของ repo นี้
- เดิมเป็น `podgemin-bot/cls-database` ซึ่งเคยเป็น Public และมีข้อมูลจริงใน history (Excel, `public/storage` 144 ไฟล์ ~45 MiB)
- Repo เดิมถูกเปลี่ยนเป็น Private แล้ว แต่ **ข้อมูลที่เคย commit ไปแล้วถือว่ารั่วแล้ว** — การลบจาก commit ล่าสุดไม่ลบออกจาก history
- Clean repo ถูกสร้างจาก snapshot ที่ตัด `.git`, dependencies, build output, `.data/`, `public/storage/`, `.env`, logs ออก
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
npm.cmd run user:list        # ดูรายชื่อผู้ใช้ + role (ไม่แสดงรหัสผ่าน)
npm.cmd run user:reset -- <email>  # รีเซ็ตรหัสผ่านจาก DB โดยตรง (pipe รหัสผ่านเข้า stdin)
```

## Environment
- `.env` (ไม่ commit): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PRIVATE_STORAGE_ROOT`
- `.env.example` / `.env.production.example` เป็น template — MariaDB options ใช้ `connectionLimit` (ตัวเลข) และ `acquireTimeout` (มิลลิวินาที) ตาม driver
- `PRIVATE_STORAGE_ROOT` ต้องอยู่นอก `public/` และบน persistent storage ใน production (เช่น `/srv/cls-data`) — `getPrivateStorageRoot()` จะ throw ถ้าอยู่ใต้ `public/`
- `.gitignore` ครอบ `.env*`, `.data/`, `dev.log`, `dev.err.log`, `prod.*.log`, `deploy.*.log`, `.dev-server.pid`, `node_modules`, `.next`, `out`, `build`, `coverage` แล้ว

## Dev server (สถานะล่าสุด)
- รันอยู่ที่ **http://localhost:3000** (Next.js 16.3.6, Turbopack) — PID บันทึกที่ `.dev-server.pid`
- Network: `http://192.168.1.48:3000`
- Log: `dev.log` / `dev.err.log` ที่ app root
- เริ่มใหม่: `npm.cmd run dev` (ถ้าพอร์ต 3000 ยังถูกจอง ให้ kill process ที่ค้างก่อน แล้วลบ `.dev-server.pid`)

### บัญชีทดสอบบน dev DB
| Email | Password | Role |
|---|---|---|
| `admin@cls.local` | ดูไฟล์รหัสผ่าน (ด้านล่าง) | ADMIN |
| `editor@cls.local` | ดูไฟล์รหัสผ่าน (ด้านล่าง) | EDITOR |
| `viewer@cls.local` | ดูไฟล์รหัสผ่าน (ด้านล่าง) | VIEWER |

- **2026-09-28: เปลี่ยนรหัสผ่านทั้ง 3 บัญชีแล้ว** เป็นค่าสุ่มยาว 24 ตัว (ไม่ใช่ `Name+Pass123!` แบบเดิม) เก็บเป็น plaintext ที่ `C:\Users\PC\AppData\Local\Temp\opencode\cls-prod-passwords.txt` — **อยู่นอก repo, ลบทันทีหลังย้ายเข้า password manager** และอย่า commit ไฟล์นี้เด็ดขาด
- ตรวจแล้วว่า login ด้วยรหัสใหม่ได้ HTTP 200 ทั้ง 3 บัญชี และรหัสเดิมได้ 401
- ลบบัญชี test/UAT แล้ว: `test-admin@example.com`, `test-admin2@example.com`, `test-admin3@example.com` (ทั้งหมดไม่มี account/session ค้าง, ADMIN เหลือ 1 คน) ใช้ `npm run user:delete -- <email> --yes`
- บัญชีที่เหลือบน dev DB มี 3 บัญชี พอดีกับ production

## Auth & Protected routes
- **Security boundary จริง:** `src/lib/auth-session.ts` → `getCurrentSession()` (React `cache`) และ `requireSession()` ที่ validate ผ่าน `auth.api.getSession()` แล้ว `redirect("/login")`
- `src/app/(front)/layout.tsx` เรียก `await requireSession()` ก่อน render → ทุก protected page ถูกบังคับ auth แม้ proxy ถูกข้าม
- `src/proxy.ts` เป็น **optimistic redirect เท่านั้น** — ใช้ `getSessionCookie()` จาก `better-auth/cookies` ซึ่งรองรับทั้ง `better-auth.session_token` และ `__Secure-better-auth.session_token`; ไม่ validate signature
- Protected: `/`, `/rooms`, `/locations`, `/floorplan`, `/engineering`, `/customers`, `/profile`, `/admin`
- **Public signup ปิดแล้ว:** `src/app/(auth)/signup/page.tsx` redirect ไป `/login`; `src/app/api/auth/[...all]/route.ts` บล็อก `POST /api/auth/sign-up/email` ด้วย `404` → ให้ ADMIN สร้างบัญชีผ่านหน้า `/admin`
- callbackURL sanitized: รับเฉพาะ path ที่ขึ้นต้น `/` และไม่ขึ้นต้น `//` (กัน open redirect ไป host อื่น)
- Role: `ADMIN` / `EDITOR` / `VIEWER` (field `user.role`) — page-level RBAC อยู่ในแต่ละ `page.tsx`; server actions มี `requireAdmin()` / role check ซ้ำ
- Session cookie เป็น **signed cookie** (HMAC ด้วย `BETTER_AUTH_SECRET`) ค่า raw token ใน DB ใช้ตรง ๆ ไม่ได้ ต้องเอาจาก `auth.api.*` + `returnHeaders: true`
- `src/lib/auth.ts` ตั้ง logger เป็น `warn` เมื่อ `NODE_ENV=production` (debug เฉพาะ dev)
- ตรวจแล้ว: `viewer@cls.local` เข้า `/admin` ได้ HTTP 200 แต่เห็นข้อความ "หน้านี้เฉพาะผู้ดูแลระบบ (Admin) เท่านั้น" และ **HTML ไม่มีอีเมลผู้ใช้หลุด** (query รายชื่อถูกข้ามก่อน render) — เป็นพฤติกรรมที่ถูกต้อง

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
- ต้นฉบับรูปทั้งหมดยังอยู่ที่ `E:\AI\Project\Opencode\CLS data collection\CLS from AGY\storage` (144 ไฟล์) — **อยู่นอก clean repo**

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
| `/admin` | User/role management (ADMIN เท่านั้น — non-ADMIN เห็นข้อความปฏิเสธ) |
| `/login` | auth (public) |
| `/signup` | ปิดแล้ว — redirect ไป `/login` |

## Data model (prisma/schema.prisma)
- `User`, `Session`, `Account` (better-auth) + field `role`
- `Customer` — code, name, stage, contactName/contactPosition/contactPhone/contactEmail, note, interestedRooms Json, inquiryDate, contract info
- `CodeSequence` — counter table (`prefix` PK, `lastValue`) สำหรับออกรหัส `CUST-xxx` ไม่ reuse
- CLS data: sites/buildings/floors/rooms + engineering (asset/certificate) + security
- Migration ล่าสุด: `20260926000000_add_code_sequence` (5 migrations ทั้งหมด)

## Scripts
| ไฟล์ | หน้าที่ |
|---|---|
| `scripts/verify-fresh-migrations.ts` | `npm run db:verify-fresh` — สร้าง DB ชั่วคราว, `migrate deploy` 2 รอบ, ตรวจ 5 migrations + `RoomSecurity` casing + ไม่มี legacy columns แล้วลบทิ้ง |
| `scripts/migrate-private-storage.ts` | `npm run storage:migrate` — ย้ายรูปจาก layout เดิมเข้า private storage, idempotent |
| `scripts/list-users.ts` | `npm run user:list` — ดูรายชื่อผู้ใช้ + role (ไม่แสดงรหัสผ่าน) |
| `scripts/reset-password.ts` | `npm run user:reset -- <email>` — รีเซ็ตรหัสผ่านจาก DB โดยตรง รับรหัสผ่านจาก `NEW_PASSWORD=` **หรือ stdin** (ป้องกันหลุดใน shell history) ไม่รับผ่าน argv, ไม่ log รหัสผ่าน/hash, `verifyPassword` ตรวจ hash ก่อนบันทึก และ revoke session เดิม |
| `scripts/import.ts` | import จาก Excel — **ห้ามรันอัตโนมัติตอน deploy** เพราะลบ facility records และไฟล์รูป |
| `scripts/export-database.ts` | export DB เป็น Excel ให้ตรงกับหน้าเว็บ |
| `scripts/*-smoke.ts`, `scripts/profile-http-smoke.ts` | smoke test ยิง dev server ผ่าน better-auth HTTP |
| `scripts/uat-card-layout.ts` | UAT card layout ผ่าน playwright-core + Chrome headless (ต้องรัน dev server ก่อน) |
| `scripts/backfill-security-defaults.ts`, `scripts/normalize-security.ts`, `scripts/seed-customers.ts` | maintenance scripts (รันซ้ำส่วนใหญ่ปลอดภัย) |

## Production deployment (deploy/)
| ไฟล์ | หน้าที่ |
|---|---|
| `deploy/README.md` | runbook ฉบับเต็ม: provision → first deploy → CI/CD → day-to-day → backup/restore → go-live checklist |
| `deploy/bootstrap-ubuntu.sh` | provision ครั้งแรก (idempotent): Node 22.12 tarball, MariaDB loopback-only, `cls` user, DB accounts, Caddy, ufw, systemd units, GitHub deploy key |
| `deploy/release.sh` | deploy แบบ release directory — `npm ci` → prisma generate → (lint/tsc/test ถ้า `--full`) → build → (db:verify-fresh ถ้า `--verify-fresh`) → dump DB → `migrate deploy` → สลับ symlink → restart → health check → rollback อัตโนมัติเมื่อไม่ผ่าน |
| `deploy/backup.sh` | `mysqldump --single-transaction` + tar รูป, เก็บ local 7 วัน, อัปโหลด OCI Object Storage แบบ instance principal (daily 7 / weekly 4) เมื่อตั้ง `OCI_BUCKET` ใน `/etc/cls-facility/backup.env` |
| `deploy/restore.sh` | กู้คืน DB — default เป็น verify-only (กู้ลงฐานชั่วคราวแล้วลบ), ของจริงต้องใส่ `--yes` และ dump สถานะปัจจุบันก่อน |
| `deploy/cls-facility.service` | systemd unit — `npm run start` ผูก `127.0.0.1:3000`, `ProtectSystem=strict`, `ReadWritePaths` เฉพาะ releases + `/srv/cls-data` |
| `deploy/cls-backup.service`, `deploy/cls-backup.timer` | สำรองข้อมูลทุกวัน 02:30 UTC |
| `deploy/Caddyfile` | reverse proxy + TLS + security headers (template แทน `__CLS_HOST__`) |
| `.github/workflows/ci.yml` | push/PR → MariaDB service container → migrate → lint → tsc → test → build |
| `.github/workflows/deploy.yml` | หลัง CI ผ่านบน main → scp สคริปต์ + SSH เรียก `release.sh --ref <sha>` (VM ดึง source และ build เอง) |

> `list-users.ts` และ `reset-password.ts` **ย้ายเข้า clean repo แล้ว** (commit `ops: add user list/reset scripts`) พร้อม npm scripts `user:list` / `user:reset` — รายละเอียดการ harden ดูตารางด้านบน

## Testing
`npm.cmd test` → **31 files / 289 tests** ผ่าน พร้อม `npx tsc --noEmit`, ESLint (0 error) และ `npm run build` (warning-free)

CI: `.github/workflows/ci.yml` ยิง MariaDB 11.4 เป็น service container (integration tests ต้องใช้ DB จริง) แล้ว `migrate deploy` → lint → `tsc --noEmit` → test → build ทุก push/PR; `deploy.yml` จะ deploy ต่อเมื่อ CI ผ่านบน main (workflow_run) เท่านั้น

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

**ข้อควรระวังเรื่อง TypeScript:** `tsconfig.json` ตั้ง `target: ES2017` ซึ่ง **ไม่รองรับ BigInt literals** (`5n`, `1n`) — ถ้าเขียนสคริปต์ที่ query `COUNT(*)` ให้ใช้ `BigInt(5)` แทน ไม่งั้น `tsc --noEmit` จะ error

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

## ประวัติ security hardening (2026-09-28)
1. **Gitleaks scan:** history เดิม 41 commits พบ 1 placeholder ใน `.env.example` ไม่ตรงกับ `.env` local และไม่ใช่ secret จริง; clean snapshot scan ผ่าน ไม่พบ leak
2. **Repo เดิม → Private**, สร้าง clean private repo `podgemin-bot/cls-facility-center` แล้ว push `main` (verified: anonymous API → `404`)
3. **Auth hardening:** เพิ่ม `auth-session.ts`, enforce ที่ `(front)/layout.tsx`, secure-cookie support, ปิด signup, safe callbackURL, ลด production log เป็น `warn`
4. **Private images:** ย้าย 144 ไฟล์ออกจาก `public/`, เพิ่ม authenticated read routes, MIME + magic-byte validation, atomic write
5. **Portability:** แก้ `RoomSecurity` casing, `connectionLimit`/`acquireTimeout`, pin Node 22.12, เพิ่ม `db:verify-fresh`, อัปเดต README เป็น systemd-first
6. **Dependencies:** Next.js `16.3.1` → `16.3.6` (ปิด critical advisory), Prisma → `7.10.0`, เพิ่ม explicit `server-only` และ `playwright-core`
7. **Fix:** `scripts/verify-fresh-migrations.ts` ใช้ BigInt literals ซึ่งขัดกับ `target: ES2017` → เปลี่ยนเป็น `BigInt()` (typecheck เคย fail 4 errors)
8. **Cleanup:** เก็บ trailing whitespace / blank line ท้ายไฟล์ 3 ไฟล์ให้ `git diff --check` สะอาด
9. **Ops scripts:** เพิ่ม `list-users.ts` + `reset-password.ts` เข้า repo พร้อม `user:list`/`user:reset`; harden `reset-password.ts` ให้รับรหัสผ่านจาก stdin (ไม่ตกใน shell history), ไม่รับผ่าน argv, ไม่ log รหัสผ่าน/hash และเตือนว่า bypass audit trail — ทดสอบ round-trip กับ `viewer@cls.local` (reset → login 200 → restore → login 200, รหัสผ่านเดิมยังใช้ได้)
10. **Deployment artifacts:** เพิ่ม `deploy/` (bootstrap, release, backup, restore, systemd unit, Caddyfile) + `.github/workflows/{ci,deploy}.yml` + runbook `deploy/README.md` — ตรวจแล้วด้วย `bash -n`, ทดสอบ logic ของ env-guard และ node snippets แยก, YAML parse ผ่าน แต่ **ยังไม่ได้รันบน Linux/ARM64 จริง**
    - `SystemCallFilter` ตั้งใจ **ไม่ใส่** ใน systemd unit (กรอง syscall แบบ blind มีโอกาสพัง Next/V8) — hardening ที่ใช้คือ `ProtectSystem=strict` + `ProtectHome`/`PrivateTmp`/`PrivateDevices`/`NoNewPrivileges`/`RestrictNamespaces`/`RestrictAddressFamilies`
11. **Production data:** เปลี่ยนรหัสผ่าน 3 บัญชี dev เป็นค่าสุ่ม 24 ตัว (ไม่ log/argv, revoke session เดิม, ยืนยันว่ารหัสเดิม 401), ลบ `test-admin*` 3 บัญชี, รีเซ็ต `CodeSequence CUST` 172 → 5, ถ่าย `mariadb-dump --single-transaction` + ทดสอบ restore เข้า scratch DB, audit `.data/` (144 ไฟล์/47,129,538 bytes, ไม่มี orphan/zero-byte/tmp/symlink)
12. **`user:delete`:** เพิ่ม `scripts/delete-user.ts` + `user:delete -- <email> --yes` สำหรับเก็บบัญชี UAT — พิมพ์ role/account/session/created_at ก่อนลบ, cascade ลบ session+account, ปฏิเสธเมื่อไม่มี `--yes` หรือเป็น ADMIN คนสุดท้าย
13. **แก้บั๊กใน deploy tooling หลัง review:** `restore.sh` เรียก `backup.sh --db-only` เป็น safety dump ก่อน `DROP DATABASE` จริง (เดิม comment สัญญาว่ามีแต่โค้ดไม่มี) และนับ user จากตาราง `` `user` `` เตราะ (VM ใช้ `lower_case_table_names=0` `` `User` `` จะไม่ resolve แล้วเงียบกลายเป็น `n/a`); `deploy.yml` เขียน `DEPLOY_SSH_KEY` ลง `~/.ssh/deploy_key` + `-i`/`IdentitiesOnly` จริง (เดิมส่ง key ให้ `actions/checkout` อย่างเดียว แต่ `scp`/`ssh` ไม่มี key ใช้ → จะ fail ทันทีตอน deploy ครั้งแรก) พร้อมย้าย secrets ไป `env:` ไม่ interpolate ลง shell script
14. **ShellCheck + เกณฑ์รับงานอัตโนมัติ:** `scripts/production-uat.ts` (`npm run uat:production`) — acceptance gate HTTP-only 21 checks (รันกับ dev แล้วผ่านทั้งหมด; บังคับ https / read-only ปริยาย); `scripts/lint-deploy-scripts.mjs` (`npm run lint:deploy`) — `bash -n` + ShellCheck `deploy/*.sh` และ `run:` blocks ใน workflows, ทำเป็น step ใน CI แล้ว; แก้ `ls -1t` → `find -printf` ใน `restore.sh`/`release.sh` (กันชื่อไฟล์/โฟลเดอร์มี space โดนตัด), และเปลี่ยน form `A && B || C` ที่โปร่งใสเป็น `if` ที่ชัดเจน — ทั้ง 4 script ShellCheck-clean แล้ว (ยืนยัน negative test ว่าลังกินของจริงได้)
15. **`db:verify-fresh` ไม่ hardcode จำนวน migration:** เดิมเทียบกับ `successful_migrations == 5` — ถ้าเพิ่ม migration ตัวที่ 6 go-live จะ fail โดยไม่จำเป็น; นับจากโฟลเดอร์ใน `prisma/migrations` ที่มี `migration.sql` (รวม `0_init`) แล้วพิมพ์ค่า expected ประกอบ (หลุมแรกที่ลอง regex `^\d{14}_` ตกรวม `0_init` → 4/5 fail ถูกต้อง; แก้เป็นนับตาม `migration.sql` → 5/5 ผ่าน); รีเซ็ต dev DB กลับสู่ pristine หลังการรันเทสต์ (users=3, sessions=0, CUST=5)
16. **ปิดช่องว่างใน backup OCI path:** `bootstrap-ubuntu.sh` เดิมไม่เคยติดตั้ง `oci` CLI → เมื่อตั้ง `OCI_BUCKET` แล้ว timer backup จะล้ม (ตอนนี้ติดตั้ง best-effort ผ่าน `pip --break-system-packages`, non-fatal + คำสั่งสำรองใน runbook); `backup.sh` อ่าน `/etc/cls-facility/backup.env` ก็ต่อเมื่อรันผ่าน systemd timer — interactive run มองไม่เห็น `OCI_BUCKET` (ตอนนี้ source เอาเอง + `strip_quotes` รองรับทั้งรูปแบบ unquoted ที่ bash source ได้กับรูปแบบ quoted ที่ systemd ตัดให้ — ทดสอบทั้ง 2 รูปแบบผ่านใน bash จำลอง); runbook อธิบายใช้ **key คู่เดียว** 2 อย่าง (public ลง `authorized_keys` + GitHub read-only deploy key) และวิธีติดตั้ง oci cli
17. **dump ที่ถ่ายบน Windows restore บน Linux ไม่ได้ (table name case):** Windows MariaDB เก็บชื่อตาราง lowercase (`lower_case_table_names=1`) → dump มี `` `roomsecurity` `` แต่ Linux VM ตั้งเป็น `0` และ Prisma ค้นตารางตาม case เดิมจาก schema (`RoomSecurity`...) → restore ตรง ๆ จะได้ DB ที่ app query ไม่ได้; เพิ่ม `scripts/portable-dump.mjs` (`npm run dump:portable`) ที่แก้ case ชื่อตารางเฉพาะใน statement (`CREATE/DROP/LOCK/ALTER/RENAME TABLE`, `INSERT INTO`) ให้ตรงกับ `CREATE TABLE \`...\`` ใน migrations — column identifier ไม่ต้องแก้ (MariaDB ไม่ sensitive อันนั้น); สร้าง artifact สำหรับ production แล้ว: `cls-ubuntu-20260928-140716.sql.gz` (แก้ case แล้ว, ทดสอบ restore ครบ 15 tables/3 users/62 rooms/5 customers/30 assets/7 certs/seq CUST=5) + `cls-data-20260928.tar.gz` (`.data/room-photos` + `floor-plans`, 46.7 MiB) + `SHA256SUMS.txt` — **restore ตัวนี้บน VM ห้ามใช้ `cls-dev-*.sql.gz` ตัวเดิม**

## งานค้าง / ความเสี่ยงที่เหลือ
- **ยังไม่ได้ทดสอบบน Linux ARM64 จริง** — `db:verify-fresh` ผ่านบน Windows local MariaDB ที่ `lower_case_table_names=1` เท่านั้น (สคริปต์จะบังคับตรวจ exact-case เมื่อค่าเป็น 0) ต้องรันซ้ำบน Ubuntu ARM64 ก่อน deploy; สคริปต์ใน `deploy/` ผ่าน `bash -n` + **ShellCheck 0 findings** (รันอัตโนมัติใน CI แล้ว) แต่ยังไม่ได้รันจริง — คาดว่าจะเหลือแค่ path/OS-specific exceptions ตอนรันจริง
- **ยังไม่ได้ provision Oracle VM** — ต้องเปิดบัญชี OCI, สร้าง A1 shape, แล้วรัน `deploy/bootstrap-ubuntu.sh`; ต้องทำ dynamic group + policy สำหรับ instance principal (Object Storage) ก่อน backup จะอัปโหลด OCI ได้
- **ยังไม่ได้ใส่ GitHub secrets** (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`) — `deploy.yml` จะ fail จนกว่าจะตั้ง และ `DEPLOY_USER` ต้องมี passwordless sudo; `DEPLOY_SSH_KEY` ต้องเป็น **private key แบบ OpenSSH** (ไม่ใช่ `.pub`) เพราะ workflow เอาไปเขียน `~/.ssh/deploy_key` แล้วตรวจด้วย `ssh-keygen -y`
- **`scripts/verify-fresh-migrations.ts` ใช้ `mariadb` โดยตรง** — เพิ่มเป็น devDependency แล้ว (`mariadb@^3.4.5`) ไม่ต้องพึ่งการ hoist ของ `@prisma/adapter-mariadb` อีกต่อไป ถ้า adapter เปลี่ยน major ก็ไม่กระทบสคริปต์นี้
- **`npm audit` เหลือ 7 รายการ (1 moderate, 6 high) — ตัดสินใจแล้ว 2026-09-28 ยอมรับ พร้อมเหตุผล:**
    - `deepmerge-ts` (ผ่าน `@prisma/config` → `prisma`) — fix ได้ทางเดียวคือ downgrade `prisma` เป็น 6.19.3 (breaking); prisma 7.10.0 คือ stable ล่าสุด (8 ยังเป็น RC) จึงยังแก้ไม่ได้
    - `mysql2` 3.15.3 (ผ่าน prisma CLI) — fix มีใน 3.24.4 แต่ต้องใส่ `overrides` ให้ transitive dep ของ Prisma ซึ่งเสี่ยงเปลี่ยนพฤติกรรมของ `migrate diff`/shadow DB; ยังไม่ทำ ถ้าจะทำให้ทดสอบ `db:verify-fresh` + เทสต์หลัง override
    - `mariadb` 3.4.5 — **ไม่มี fix** และเป็นเวอร์ชันเดียวกับที่ `@prisma/adapter-mariadb` ใช้อยู่แล้ว (การประกาศเป็น devDependency ไม่ได้เพิ่มความเสี่ยงใหม่); advisory ที่เกี่ยวข้องคือ cleartext password ต่อ MitM — ลดความเสี่ยงได้เพราะ MariaDB bind แค่ `127.0.0.1`; อีกอันเป็น SQL injection เฉพาะ charset big5/gbk/sjis/cp932/gb18030 ซึ่งเราใช้ utf8mb4
    - `xlsx` — **ไม่มี fix**; ย้ายจาก `dependencies` เป็น `devDependencies` แล้วเพราะมีแต่ `scripts/import.ts` กับ `scripts/export-database.ts` ใช้ ไม่มีส่วนไหนใน `src/` import; ถ้าอยากตัด advisory ให้ได้จริงต้องลบสคริปต์ทั้งสองทิ้ง (เป็นเครื่องมือ seed/ส่งออกข้อมูล) — ยังไม่ทำเพราะเป็นงานประวัติของโปรเจกต์
- **Working copy ยังมีงาน uncommitted ทั้งหมด** และยังชี้ `origin` ไปที่ `cls-database` — ต้องระวังไม่ push ผิกที่ (เนื้อหา tracked ของ working copy ตรงกับ clean repo ทุกไฟล์ ยกเว้นไฟล์ที่ gitignore เช่น `.env`, `.data/`, logs)
- **`reset-password.ts` เป็น ops tool ที่เขียนรหัสผ่านลง DB ได้โดยไม่มี session** — คนที่รันได้เท่ากับ bypass หน้า `/admin` ทั้งหมด จำกัดสิทธิ์ผู้ใช้ที่รัน shell บน VM, อย่าใส่รหัสผ่านใน argv, ล้างไฟล์/ตัวแปรรหัสผ่านหลังใช้ (รองรับ stdin แล้ว)
- **Production data เตรียมแล้ว (2026-09-28)** ยกเว้น 2 อย่างที่ต้องทำบน VM: เปลี่ยนรหัสผ่านทั้ง 3 บัญชี (สุ่มใหม่ 24 ตัว, ทดสอบ login 200/401 ผ่าน), ลบ `test-admin*` ทั้ง 3 บัญชี, รีเซ็ต `CodeSequence CUST` จาก 172 → 5, `mariadb-dump --single-transaction` + ทดสอบ restore เข้า scratch DB สำเร็จ — **dump ที่จะใช้บน VM คือ `cls-ubuntu-20260928-140716.sql.gz`** (ผ่าน `portable-dump` แล้ว — Windows dump มีชื่อตาราง lowercase ซึ่ง restore บน Linux `lower_case_table_names=0` ไม่ได้) — ที่เหลือคือ copy `.data/` (tar: `cls-data-20260928.tar.gz`) ไป `/srv/cls-data` และ `BETTER_AUTH_SECRET` ใหม่ซึ่ง `bootstrap-ubuntu.sh` สร้างให้เองบน VM
- **ยังไม่ได้ provision Oracle VM** และยังไม่มี GitHub Actions workflow
- **การรั่วไหลในอดีตย้อนกลับไม่ได้** — ถือว่าข้อมูล/รูปที่เคยอยู่ใน public repo อาจถูกเข้าถึงแล้ว ควรพิจารณาหมุนข้อมูลที่เป็นความลับ
- **ไฟล์รหัสผ่านชั่วคราว** `C:\Users\PC\AppData\Local\Temp\opencode\cls-admin-pw.txt` (plaintext) — ลบได้แล้ว ไม่ใช้อีก; ไฟล์รหัสผ่านรุ่นใหม่คือ `C:\Users\PC\AppData\Local\Temp\opencode\cls-prod-passwords.txt` (plaintext, 3 บัญชี) — **ต้องลบหลังย้ายเข้า password manager**

## โน้ตที่ยังใช้ได้
- **Prisma 7 CLI:** `migrate deploy` ต้องมี `prisma.config.ts` (datasource url) — `schema.prisma` อย่างเดียวไม่พอ; `migrate diff --from-migrations` ต้องมี `shadowDatabaseUrl` (flags เก่า `--to-schema-datamodel`/`--shadow-database-url` ถูกลบแล้ว) — ใช้ `--from-config-datasource --to-schema ...` ตรวจ drift แทน
- **`Table` (`src/components/ui/table.tsx`) เป็นจุดเดียวที่กำหนดหน้าตาตารางบนมือถือ** — ถ้าเพิ่มตารางใหม่ให้ใช้ `Table` + `TableHeader` สม่ำเสมอ; cell ที่หัวคอลัมน์ว่าง (คอลัมน์ action) จะไม่มี label บนการ์ดโดยอัตโนมัติ
- **ถ้าหน้าไหนค้างที่ "Rendering" หลัง action** ให้เรียก `router.refresh()` ฝั่ง client หลัง action สำเร็จ (pattern เดียวกับ engineering/floorplan/rooms/locations/customers/admin/profile) — ตอนนี้ครบทุกหน้าแล้ว
- **Hydration warning ใน dev** เป็น transient noise ของ `cacheComponents` + Turbopack — post-hoc probes reproduce ไม่ได้ ไม่ใช่ code bug
- **สคริปต์ใน `scripts/` ที่เปิด `prisma` ต้อง `process.exit()` ตอนจบ** ไม่งั้น process ค้างที่ connection pool
- **PowerShell 5.1 บนเครื่องนี้อ่านภาษาไทยเป็น `?`** — ต้องใช้ `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` + `WebClient.Encoding = UTF8` เพื่ออ่าน HTML ที่มีภาษาไทย
- **`[System.Web.Security.Membership]` ใช้ไม่ได้** ใน PowerShell 5.1 (ไม่ได้ load assembly) — สร้างรหัสผ่านสุ่มด้วย `node -e "...crypto.randomInt..."` แทน
- **Env var ไม่ทำงานข้าม bash tool call** (แต่ละ call เป็น process ใหม่) — ต้อง generate + ใช้รหัสผ่านในคำสั่งเดียวกัน
- `AGENTS.md`: Next.js เวอร์ชันนี้มี breaking changes — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด
- **counter `CUST` เคยมีช่องว่างถึง 172 ทั้งที่มีลูกค้าแค่ 5 ราย** (จาก concurrency test) — รีเซ็ตเป็น 5 แล้ว 2026-09-28 หลังยืนยันว่ามีแค่ `CUST-001`..`CUST-005` รหัสถัดไปจึงเป็น `CUST-006`; **แต่ `npm test` รันบน dev DB เดียวกันและเผา counter อีก (5 → 13)** เพราะ test สร้าง/ลบลูกค้า และทิ้ง session ไว้ด้วย — ต้องรีเซ็ตหลังรันเทสต์ทุกครั้ง ถ้าจะถ่าย snapshot สำหรับ production; อย่าหวังว่า dump จะสะอาดถ้าเพิ่งรันเทสต์
- **ห้ามรัน `scripts/import.ts` อัตโนมัติระหว่าง deploy** เพราะลบ facility records และไฟล์รูป — ใช้ dump/restore สำหรับ production
- **`/etc/cls-facility/env` ต้องครอบทุกค่าด้วย `"`** เพราะ `DATABASE_URL` มี `&` — bash จะอ่านเป็น background operator (ทั้ง `set -a; . env; set +a` และ systemd `EnvironmentFile` ต้องการ quotes); `release.sh` มี guard `grep -nE '^[A-Za-z_][A-Za-z0-9_]*=[^"'\'']*&'` แล้วหยุดทันทีถ้าไม่มี quotes
- **บน VM ห้ามใช้ `npm prune --omit=dev`** — `release.sh` เก็บ devDependencies ไว้เพราะ `tsx` (ops scripts) และ `prisma` CLI อยู่ในนั้น; จัดการพื้นที่ด้วย `--keep N` แทน
- **Caddy ต้องส่งต่อ public host ใน `X-Forwarded-Host`** — Next.js เทียบ `Origin` กับ `X-Forwarded-Host` ใน Server Actions แล้ว reject เมื่อไม่ตรง ถ้าเปลี่ยน proxy ต้องใส่ `serverActions.allowedOrigins`

## งานที่จะทำต่อ
1. ~~ตัดสินใจเรื่อง scripts~~ **เสร็จแล้ว (2026-09-28):** `list-users.ts` + `reset-password.ts` เข้า repo พร้อม `user:list`/`user:reset` (harden stdin) — ข้อถัดไปคือข้อ 2
2. Provision Oracle Always Free ARM64 VM: เลือก home region ใกล้ไทยที่มี A1 capacity, Ubuntu + SSH key + persistent volume, firewall เปิดเฉพาะ 22/80/443 แล้วรัน `deploy/bootstrap-ubuntu.sh` (ทำแทนข้อ 3, 5, 6 ที่ยังไม่มี VM) — **ยังต้องเปิดบัญชี OCI เอง**
3. บน VM: `release.sh --full --verify-fresh` (ครอบคลุม `npm ci` → prisma generate → lint → tsc → test → build → **db:verify-fresh** บน Linux case-sensitive) — ต้องผ่านก่อน go-live
4. ~~เตรียม production data~~ **เสร็จแล้ว (2026-09-28):** เปลี่ยนรหัสผ่าน 3 บัญชี (สุ่มใหม่, login 200/401 ยืนยันแล้ว), ลบ `test-admin*` ทั้ง 3, `CodeSequence CUST` 172 → 5, ล้าง session ที่ test suite ทิ้งไว้, `mariadb-dump --single-transaction` + พิสูจน์ว่า restore เข้า scratch DB ได้ — **restore บน VM ต้องใช้ `cls-ubuntu-20260928-140716.sql.gz` (ผ่าน `portable-dump`, case ชื่อตารางถูกสำหรับ Linux) ที่ `C:\Users\PC\AppData\Local\Temp\opencode\cls-data-prep\` พร้อมกับ `cls-data-20260928.tar.gz` (`/srv/cls-data`) + `SHA256SUMS.txt`** — **เหลือทำบน VM:** copy `.data/` ไป `/srv/cls-data`, load dump ผ่าน `restore.sh --file`, และยืนยันว่า `BETTER_AUTH_SECRET` ใหม่ถูกสร้าง
5. ~~Deploy แบบ release directory~~ **เตรียมไว้แล้ว:** `deploy/release.sh` (build → dump → migrate → สลับ symlink → health-check → rollback) — ต้องรันจริงบน VM อย่างน้อย 1 ครั้ง
6. ~~ตั้ง GitHub Actions~~ **เตรียมไว้แล้ว:** `.github/workflows/ci.yml` + `deploy.yml` — ต้องใส่ secrets (`DEPLOY_HOST/USER/SSH_KEY/KNOWN_HOSTS`) และตั้ง dynamic group/policy ของ OCI ให้เสร็จก่อน
7. ตั้ง URL/HTTPS: DuckDNS + Caddy, ตั้ง `BETTER_AUTH_URL=https://...`; เมื่อได้โดเมนองค์กรค่อยย้าย DNS ไป Cloudflare และบังคับ canonical host
8. Backup/monitoring: `cls-backup.timer` + `backup.sh` (OCI instance principal, 7 daily / 4 weekly) เตรียมไว้แล้ว — ต้องสร้าง bucket + dynamic group/policy และพิสูจน์ด้วย `restore.sh --latest --verify-only` ก่อน go-live
9. ~~Production UAT ก่อน go-live~~ **มีตัวรันอัตโนมัติแล้ว (2026-09-28):** `scripts/production-uat.ts` + `npm run uat:production` ตรวจผ่าน HTTP อย่างเดียว ไม่ต่อ DB — 21 check (TLS/security headers, `__Secure-` cookie, signup ปิด, redirect ของ unauthenticated + forged cookie, ไม่มีรูปหลุดทั้ง private route และ path เก่าใน `public/`, login 3 role, RBAC `/admin` + ไม่ให้ email หลุด, origin guard ของ Server Actions) — รันกับ dev แล้วผ่านหมด; บังคับให้เป็น https และ read-only เป็นค่าเริ่มต้น (`UAT_ALLOW_HTTP=1` / `UAT_ALLOW_WRITES=1` สำหรับ dry run); **ที่ยังต้องทำเอง:** CRUD ผ่าน browser, reboot persistence, ตรวจ layout มือถือ/เดสก์ท็อป, และ `db:verify-fresh` บน ARM64 จริง
    - เหตุผลที่ต้องมีตัวใหม่: `scripts/*-e2e-smoke.ts` เดิม import `prisma`/`auth` → รันได้แค่บนเครื่องที่มี DB credentials ใช้ตรวจ host จริงไม่ได้ และ hardcode `localhost:3000`
