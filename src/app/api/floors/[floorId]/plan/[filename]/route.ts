import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PrivateImageError, readFloorPlan } from "@/lib/private-images";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ floorId: string; filename: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session?.user?.id) return new Response(null, { status: 401 });

  const { floorId: rawFloorId, filename } = await params;
  const floorId = Number(rawFloorId);
  if (!Number.isSafeInteger(floorId) || floorId <= 0) {
    return new Response(null, { status: 400 });
  }

  const floor = await prisma.floor.findUnique({
    where: { id: floorId },
    select: { planImage: true },
  });
  if (!floor?.planImage || floor.planImage.split(/[\\/]/).pop() !== filename) {
    return new Response(null, { status: 404 });
  }

  try {
    const image = await readFloorPlan(floorId, floor.planImage);
    return new Response(new Uint8Array(image.buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(image.buffer.byteLength),
        "Content-Type": image.mime,
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof PrivateImageError && error.code === "invalid-input" ? 400 : 404;
    return new Response(null, { status });
  }
}
