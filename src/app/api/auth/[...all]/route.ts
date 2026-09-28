import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export function POST(request: Request) {
  if (new URL(request.url).pathname === "/api/auth/sign-up/email") {
    return new Response(null, { status: 404 });
  }
  return handlers.POST(request);
}
