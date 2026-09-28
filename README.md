# CLS Facility Center

ระบบบริหารจัดการศูนย์โทรคมนาคมและสถานีเคเบิลใต้น้ำ (Cable Landing Station) — ปากบารา (PKB, สตูล) และสงขลา (SKA)

Web app สำหรับจัดการข้อมูลอาคาร / ชั้น / ห้อง, ระบบความปลอดภัย, ระบบไฟฟ้า-ทำความเย็น, ใบรับรอง และผังชั้นแบบ Interactive พร้อมระบบสิทธิ์ผู้ใช้ (Admin / Editor / Viewer)

## เทคโนโลยี

- [Next.js](https://nextjs.org) 16 (App Router, Turbopack, Cache Components)
- React 19, TypeScript
- [better-auth](https://better-auth.com) — ระบบยืนยันตัวตน + API / email, password
- [Prisma](https://www.prisma.io) 7 + MySQL / MariaDB (driver adapter)
- Tailwind CSS v4 + shadcn/ui
- Vitest — unit/smoke test

## โครงสร้าง

```
src/
├─ app/
│  ├─ (auth)/login, (auth)/signup        # หน้าเข้าสู่ระบบ / สมัครสมาชิก
│  ├─ (front)/                           # พื้นที่หลัง login
│  │  ├─ page.tsx                        # ภาพรวมสถานี (dashboard)
│  │  ├─ rooms/       ระบบห้อง + รูปถ่าย + รายละเอียด
│  │  ├─ locations/   ลำดับชั้น Site → Building → Floor → Room (CRUD)
│  │  ├─ floorplan/   ผังชั้น Interactive + การวางหมุด (pin)
│  │  ├─ engineering/ Power / Cooling / ใบรับรอง / ความปลอดภัย
│  │  ├─ profile/     โปรไฟล์ + เปลี่ยนรหัสผ่าน
│  │  └─ admin/       จัดการผู้ใช้และสิทธิ์ (Admin เท่านั้น)
│  └─ api/auth/[...all]                 # better-auth routes
├─ components/ui/      # shadcn/ui components
└─ lib/                # auth, prisma client, helpers
prisma/schema.prisma   # โมเดลข้อมูล
prisma/migrations/     # Prisma migrations
scripts/import.ts      # import จาก Excel master database (ครั้งเดียว)
```

## เริ่มต้นพัฒนา (Development)

```bash
# 1. ตั้งค่าตัวแปร environment
cp .env.example .env
# แก้ DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL ใน .env ตามจริง

# 2. ติดตั้ง dependencies
npm install

# 3. generate Prisma client และสร้าง schema ในฐานข้อมูล
npx prisma generate
npm run db:push     # เทียบเท่า prisma db push (เฉพาะ dev ครั้งแรก)

# 4. import ข้อมูลจาก Excel (ครั้งเดียว เมื่อมี CLS_Master_Database_Original.xlsx)
npx tsx scripts/import.ts

# 5. รัน dev server
npm run dev
# เปิด http://localhost:3000
```

## Scripts

| คำสั่ง | ความหมาย |
| ------ | ------- |
| `npm run dev` | รัน dev server (Turbopack) |
| `npm run build` | build สำหรับ production |
| `npm run start` | รัน production build |
| `npm run lint` | ตรวจ lint ด้วย ESLint |
| `npm test` | รัน unit/smoke test ด้วย Vitest |
| `npm run db:deploy` | ใช้ migrations กับฐานข้อมูล (production) |
| `npm run db:push` | sync schema โดยตรง `prisma db push` (dev) |
| `npm run user:list` | ดูรายชื่อผู้ใช้ + role (ไม่แสดงรหัสผ่าน) |
| `npm run user:reset -- <email>` | รีเซ็ตรหัสผ่านจาก DB โดยตรง (ดูหมายเหตุด้านล่าง) |

## กู้คืนการเข้าสู่ระบบ (ops)

`user:reset` เขียน password hash ลง `Account` โดยตรง ใช้เมื่อล็อกอินไม่ได้และไม่มี ADMIN session เหลือ (เช่น ลืมรหัสผ่าน admin ทั้งหมด) สคริปต์จะ revoke session เดิมของผู้ใช้นั้นทั้งหมด

รันบนเครื่องที่มี `.env` และเข้าถึงฐานข้อมูลได้เท่านั้น — ผู้ที่รันได้เท่ากับ bypass หน้า `/admin` ทั้งหมด และไม่มี audit trail จาก UI

```bash
# วิธีที่ปลอดภัยกว่า: pipe รหัสผ่านเข้า stdin (ไม่ตกใน shell history)
printf '%s' "$NEW_PW" | npm run user:reset -- admin@example.com

# หรืออ่านจากไฟล์ที่เขียนแล้วลบทันที
Get-Content -Raw pw.txt | npm run user:reset -- admin@example.com   # PowerShell
cat pw.txt | npm run user:reset -- admin@example.com && shred -u pw.txt   # Linux

# สำหรับ automation เท่านั้น (ระวัง secret ตกใน shell history และ CI log)
NEW_PASSWORD='...' npm run user:reset -- admin@example.com
```

หมายเหตุ: รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร, ไม่รับรหัสผ่านผ่าน argv, และไม่ log รหัสผ่านหรือ hash ออกทาง stdout

## Role / สิทธิ์

| Role | ความสามารถ |
| ---- | ---------- |
| ADMIN | ทุกอย่าง รวมถึงจัดการผู้ใช้ในหน้า `/admin` |
| EDITOR | แก้ไข / เพิ่ม / ลบข้อมูล (rooms, locations, floorplan, engineering) |
| VIEWER | ดูข้อมูลได้อย่างเดียว |

การยืนยันสิทธิ์ทำแบบ layered: `src/proxy.ts` ตรวจว่า logged-in (redirect ไป `/login` ถ้าไม่) และ guard อีกชั้นใน server components / server actions (`auth.api.getSession`) ทุกครั้ง

## Production Deployment

Production ใช้ Ubuntu ARM64 VM, Node.js 22.12+, MariaDB ที่ bind เฉพาะ `127.0.0.1`, Caddy และ `systemd` โดย build บน VM โดยตรง ห้าม copy `.next` หรือ `node_modules` จาก Windows/x64

```bash
nvm install 22.12.0
nvm use 22.12.0
npm ci
npx prisma generate
npm run lint
npm test
npx tsc --noEmit
npm run build
npm run db:deploy
sudo systemctl restart cls-facility
curl -fsS http://127.0.0.1:3000/login >/dev/null
```

หมายเหตุ:
- `.env.example` เป็น template ตัวจริง — ห้ามใส่ secrets จริงในไฟล์ที่ commit ขึ้น repo
- ตั้ง `PRIVATE_STORAGE_ROOT=/srv/cls-data` บน persistent volume และห้ามวางใต้ `public/` หรือ release directory
- รัน `npm run storage:migrate` ครั้งเดียวเมื่อต้องย้ายไฟล์จากระบบเดิม แล้วสำรอง `.data`/`/srv/cls-data` แยกจาก source code
- `next.config.ts` ยังตั้ง `output: "standalone"` ไว้สำหรับ Docker fallback เท่านั้น; production รอบนี้ไม่ใช้ Docker
- ถ้ามีการเปลี่ยน `schema.prisma` ให้สร้าง migration ด้วย `npx prisma migrate dev` แล้ว commit ไฟล์ migration ไว้เสมอ

Dockerfile เป็น fallback ที่ยังไม่ได้รับเลือกหรือรับรองสำหรับ production หากต้องใช้ ต้อง mount private storage และตั้ง `PRIVATE_STORAGE_ROOT` ให้ตรง mount เอง

## ความปลอดภัย

- เปลี่ยน `BETTER_AUTH_SECRET` เป็นค่าสุ่มยาว (เช่น `openssl rand -base64 32`) ก่อนขึ้น production
- ไม่ commit `.env`, secrets หรือ credential จริงลง git
- `npm run user:reset` เป็นเครื่องมือระดับ ops ที่เขียนรหัสผ่านลง DB ได้โดยไม่มี session — จำกัดสิทธิ์ผู้ใช้ที่รัน shell และล้างไฟล์/ตัวแปรรหัสผ่านหลังใช้เสร็จ
- Production ควรใช้ HTTPS และตั้ง `BETTER_AUTH_URL` ให้ตรงกับโดเมนจริง
