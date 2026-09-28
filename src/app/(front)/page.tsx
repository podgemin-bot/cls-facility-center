import Link from "next/link";
import { connection } from "next/server";
import { Building2, Layers, DoorOpen, MapPin, ArrowRight } from "lucide-react";
import prisma from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_META, STATUS_ORDER, type RoomStatus } from "@/lib/cls";
import { requireSession } from "@/lib/auth-session";

export const instant = false;

export default async function DashboardPage() {
  await connection();
  await requireSession();

  const sites = await prisma.site.findMany({
    orderBy: { code: "asc" },
    include: {
      buildings: {
        orderBy: { code: "asc" },
        include: {
          floors: {
            orderBy: { level: "asc" },
            include: { _count: { select: { rooms: true } } },
          },
        },
      },
    },
  });

  const statusBySite = await Promise.all(
    sites.map(async (site) => {
      const groups = await prisma.room.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: { floor: { building: { siteId: site.id } } },
      });
      const map = new Map<RoomStatus, number>(
        groups.map((g) => [g.status as RoomStatus, g._count._all])
      );
      return map;
    })
  );

  const totalRooms = statusBySite.reduce(
    (sum, counts) => sum + STATUS_ORDER.reduce((s, st) => s + (counts.get(st) ?? 0), 0),
    0
  );

  return (
    <div className="mx-auto max-w-(--breakpoint-xl) px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">ภาพรวมสถานี</h1>
        <p className="text-sm text-muted-foreground">
          ศูนย์โทรคมนาคมและสถานีเคเบิลใต้น้ำ (Cable Landing Station) — รวมทุกสถานี{" "}
          <Badge variant="secondary" className="mx-1">{sites.length}</Badge> แห่ง ·{" "}
          <Badge variant="secondary" className="mx-1">{totalRooms}</Badge> ห้อง
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">สถานะห้อง:</span>
        {STATUS_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${STATUS_META[s].dot}`} />
            {STATUS_META[s].label}
          </span>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {sites.map((site, idx) => {
          const counts = statusBySite[idx];
          const siteTotal = STATUS_ORDER.reduce((s, st) => s + (counts.get(st) ?? 0), 0);
          const building = site.buildings[0];
          const floors = building?.floors ?? [];

          return (
            <Card key={site.id} className="overflow-hidden pt-0">
              <div className="bg-gradient-to-r from-sky-600 to-cyan-500 px-6 py-5 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs opacity-80">{site.code}</div>
                    <h2 className="text-xl font-bold">{site.name}</h2>
                    <p className="mt-1 flex items-center gap-1 text-xs opacity-90">
                      <MapPin className="size-3.5" />
                      จ.{site.province} · GPS {site.lat?.toFixed(4)}, {site.lng?.toFixed(4)}
                    </p>
                  </div>
                  <a
                    href={`https://maps.google.com/?q=${site.lat},${site.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-white/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/25"
                  >
                    เปิดแผนที่
                  </a>
                </div>
              </div>

              <CardContent className="space-y-5 pt-5">
                <div className="grid grid-cols-3 gap-3">
                  <Stat icon={<Building2 className="size-4" />} label="อาคาร" value={site.buildings.length} />
                  <Stat icon={<Layers className="size-4" />} label="ชั้น" value={floors.length} />
                  <Stat icon={<DoorOpen className="size-4" />} label="ห้อง" value={siteTotal} />
                </div>

                <div>
                  <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-muted">
                    {STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => (
                      <div
                        key={s}
                        className={STATUS_META[s].bar}
                        style={{ width: `${((counts.get(s) ?? 0) / Math.max(siteTotal, 1)) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {STATUS_ORDER.map((s) => (
                      <span key={s} className="text-muted-foreground">
                        {STATUS_META[s].label}:{" "}
                        <span className="font-semibold text-foreground">{counts.get(s) ?? 0}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium text-muted-foreground">ชั้นทั้งหมด</div>
                  <div className="flex flex-wrap gap-2">
                    {floors.map((f) => (
                      <Link key={f.id} href={`/rooms?floor=${f.code}`}>
                        <Badge
                          variant="outline"
                          className="cursor-pointer px-3 py-1 hover:border-primary hover:text-primary"
                        >
                          {f.label} · {f._count.rooms} ห้อง
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>

                <Button asChild className="w-full" variant="outline">
                  <Link href={`/rooms?site=${site.code}`}>
                    ดูห้องทั้งหมดของ{site.code}
                    <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
      <span className="flex size-9 items-center justify-center rounded-md bg-background text-primary shadow-sm">
        {icon}
      </span>
      <div>
        <div className="text-lg leading-none font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
