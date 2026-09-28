import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const SESSION_COOKIE = "better-auth.session_token=signed-token";
const SECURE_SESSION_COOKIE = "__Secure-better-auth.session_token=signed-token";

function makeRequest(path: string, cookie?: string | boolean): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie === true ? SESSION_COOKIE : cookie);
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

describe("auth proxy guard", () => {
  it("redirects unauthenticated visitors from / to /login", () => {
    const res = proxy(makeRequest("/"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects /rooms unauthenticated with callbackURL", () => {
    const res = proxy(makeRequest("/rooms"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain(encodeURIComponent("/rooms"));
  });

  it("redirects protected sub-paths for unauthenticated visitors", () => {
    const res = proxy(makeRequest("/floorplan?site=PKB"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects /customers unauthenticated with callbackURL", () => {
    const res = proxy(makeRequest("/customers"));
    expect(res.status).toBe(307);
    const loc = res.headers.get("location")!;
    expect(loc).toContain("/login");
    expect(loc).toContain(encodeURIComponent("/customers"));
    expect(proxy(makeRequest("/customers", true)).status).toBe(200);
  });

  it("keeps /login and /signup public for visitors", () => {
    expect(proxy(makeRequest("/login")).status).toBe(200);
    expect(proxy(makeRequest("/signup")).status).toBe(200);
  });

  it("leaves session validation on /login to the page", () => {
    const res = proxy(makeRequest("/login", true));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("optimistically lets requests with either session cookie through", () => {
    expect(proxy(makeRequest("/rooms", true)).status).toBe(200);
    expect(proxy(makeRequest("/", SECURE_SESSION_COOKIE)).status).toBe(200);
    expect(proxy(makeRequest("/admin", SECURE_SESSION_COOKIE)).status).toBe(200);
  });

  it("does not treat the optimistic cookie check as session validation", () => {
    expect(proxy(makeRequest("/customers", "better-auth.session_token=forged")).status).toBe(200);
  });

  it("never validates callbackURL pointing to an external origin", () => {
    const res = proxy(makeRequest(`/rooms`));
    const loc = res.headers.get("location")!;
    const cb = new URL(loc).searchParams.get("callbackURL")!;
    expect(cb.startsWith("/") && !cb.startsWith("//")).toBe(true);
  });
});
