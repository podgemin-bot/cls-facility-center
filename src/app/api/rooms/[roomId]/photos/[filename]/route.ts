import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PrivateImageError, readRoomPhoto } from "@/lib/private-images";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string; filename: string }> }
) {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session?.user?.id) return new Response(null, { status: 401 });

  const { roomId: rawRoomId, filename } = await params;
  const roomId = Number(rawRoomId);
  if (!Number.isSafeInteger(roomId) || roomId <= 0) {
    return new Response(null, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) return new Response(null, { status: 404 });

  try {
    const image = await readRoomPhoto(roomId, filename);
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
