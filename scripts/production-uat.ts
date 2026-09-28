/**
 * Production acceptance gate for CLS Facility Center.
 *
 * Talks to a deployed host over HTTP only: no database access, no build output,
 * no direct imports from src/. That is deliberate. The dev smoke scripts in
 * scripts/*-e2e-smoke.ts import prisma and auth, so they can only ever run on a
 * machine that already has the database credentials, which makes them useless
 * as a go-live check against the real host.
 *
 * Credentials come from the environment and are never echoed. Anything that
 * writes is opt-in, so the default run is safe to point at live data.
 *
 * Required:
 *   UAT_BASE_URL                 https://host  (http only with UAT_ALLOW_HTTP=1)
 *   UAT_ADMIN_EMAIL              required
 *   UAT_ADMIN_PASSWORD           required
 * Optional but recommended, each unlocks the checks that need that role:
 *   UAT_EDITOR_EMAIL / UAT_EDITOR_PASSWORD
 *   UAT_VIEWER_EMAIL / UAT_VIEWER_PASSWORD
 * Optional:
 *   UAT_ALLOW_WRITES=1           also create and delete a throwaway room
 *
 * Exit code is 0 only when every required check passes.
 */
import "dotenv/config";

type Result = { name: string; ok: boolean; detail: string; required: boolean };

const BASE = (process.env.UAT_BASE_URL ?? "").replace(/\/+$/, "");
const ALLOW_HTTP = process.env.UAT_ALLOW_HTTP === "1";
const ALLOW_WRITES = process.env.UAT_ALLOW_WRITES === "1";
const HTTPS = BASE.startsWith("https://");

const results: Result[] = [];

function record(name: string, ok: boolean, detail = "", required = true) {
  results.push({ name, ok, detail, required });
}

function check(name: string, ok: boolean, detail = "") {
  record(name, ok, detail, true);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

function skip(name: string, why: string) {
  record(name, true, `skipped: ${why}`, false);
  console.log(`SKIP  ${name}  ${why}`);
}

function warn(name: string, detail: string) {
  record(name, true, detail, false);
  console.log(`NOTE  ${name}  ${detail}`);
}

/** Minimal cookie jar: enough for one session, no dependency needed. */
class Jar {
  private cookies = new Map<string, string>();

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  absorb(response: Response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const match = /^([^=]+)=([^;]*)/.exec(raw);
      if (match) {
        const value = match[2];
        if (value === "null" || value === "") this.cookies.delete(match[1]);
        else this.cookies.set(match[1], value);
      }
    }
  }

  names(): string[] {
    return [...this.cookies.keys()];
  }
}

async function request(
  path: string,
  init: RequestInit & { jar?: Jar } = {}
): Promise<{ status: number; body: string; headers: Headers }> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (init.jar?.header()) headers.set("cookie", init.jar.header());
  if (!headers.has("origin") && !headers.has("host")) headers.set("origin", BASE);
  const response = await fetch(BASE + path, { ...init, headers, redirect: "manual" });
  const body = await response.text();
  init.jar?.absorb(response);
  return { status: response.status, body, headers: response.headers };
}

async function signIn(email: string, password: string): Promise<Jar | null> {
  const jar = new Jar();
  const { status } = await request("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password, rememberMe: false }),
    jar,
  });
  if (status !== 200 || jar.names().length === 0) return null;
  return jar;
}

function isRedirect(status: number): boolean {
  return status === 302 || status === 303 || status === 307 || status === 308;
}

function locationOf(headers: Headers): string {
  return headers.get("location") ?? "";
}

async function main() {
  if (!BASE) {
    console.error("UAT_BASE_URL is required, e.g. UAT_BASE_URL=https://cls.example.com");
    process.exit(1);
  }
  if (!HTTPS && !ALLOW_HTTP) {
    console.error(`${BASE} is not https. Refusing to call that a production check.`);
    console.error("Use https, or set UAT_ALLOW_HTTP=1 for a local dry run.");
    process.exit(1);
  }

  const adminEmail = process.env.UAT_ADMIN_EMAIL;
  const adminPassword = process.env.UAT_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.error("UAT_ADMIN_EMAIL and UAT_ADMIN_PASSWORD are required.");
    process.exit(1);
  }

  console.log(`CLS Facility Center production acceptance`);
  console.log(`target: ${BASE}`);
  console.log(`mode:   ${HTTPS ? "https" : "http (UAT_ALLOW_HTTP=1)"}, writes ${ALLOW_WRITES ? "enabled" : "disabled"}\n`);

  // ---------------------------------------------------------------- transport
  {
    const { status, headers } = await request("/login");
    check("login page responds 200", status === 200, `status=${status}`);
    check(
      "server header removed by the proxy",
      !headers.get("server"),
      `server=${headers.get("server") ?? "(absent)"}`
    );
  }

  if (HTTPS) {
    const { headers } = await request("/login");
    const hsts = headers.get("strict-transport-security") ?? "";
    check("HSTS present with a year max-age", /max-age=\s*31536000/.test(hsts), hsts || "(absent)");
    check("X-Content-Type-Options: nosniff", headers.get("x-content-type-options") === "nosniff");
    const frame = headers.get("x-frame-options") ?? headers.get("content-security-policy") ?? "";
    check("clickjacking protection", frame === "DENY" || /frame-ancestors/.test(frame), frame || "(absent)");
    check("Referrer-Policy set", Boolean(headers.get("referrer-policy")), headers.get("referrer-policy") ?? "(absent)");
  } else {
    skip("HSTS / security headers", "only meaningful over https");
  }

  // ------------------------------------------------------------ auth surface
  {
    const { status } = await request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: `uat-${Date.now()}@example.invalid`, password: "UatPass123!", name: "uat" }),
    });
    check("public sign-up is closed", status === 404, `status=${status}`);
  }

  {
    const { status, headers } = await request("/");
    check(
      "unauthenticated / redirects to /login",
      isRedirect(status) && locationOf(headers).includes("/login"),
      `status=${status} location=${locationOf(headers) || "(none)"}`
    );
  }

  {
    const jar = new Jar();
    jar.absorb(
      new Response(null, {
        headers: { "set-cookie": "better-auth.session_token=forged-value; Path=/" },
      })
    );
    const { status, headers } = await request("/", { jar });
    check(
      "forged session cookie is rejected",
      isRedirect(status) && locationOf(headers).includes("/login"),
      `status=${status} location=${locationOf(headers) || "(none)"}`
    );
  }

  // ------------------------------------------------- private file protection
  for (const path of [
    "/api/rooms/1/photos/01.jpg",
    "/api/floors/1/plan/F01.png",
    "/storage/photos/anything/01.jpg",
    "/storage/plans/anything/F01.png",
  ]) {
    const { status, body } = await request(path);
    const leakedImage = /^(\x89PNG|\xff\xd8\xff)/.test(body.slice(0, 4));
    check(
      `no image over http: ${path}`,
      status !== 200 && !leakedImage,
      `status=${status}`
    );
  }

  // ------------------------------------------------------------- role checks
  const adminJar = await signIn(adminEmail, adminPassword);
  if (!adminJar) {
    check("admin can sign in", false, "sign-in failed or no cookie returned");
  } else {
    check("admin can sign in", true, `cookies=${adminJar.names().join(",")}`);

    if (HTTPS) {
      check(
        "session cookie is __Secure- prefixed over https",
        adminJar.names().some((name) => name.startsWith("__Secure-")),
        adminJar.names().join(",")
      );
    }

    const admin = await request("/admin", { jar: adminJar });
    check("admin reaches /admin", admin.status === 200, `status=${admin.status}`);
    check(
      "admin page lists users",
      admin.body.includes(adminEmail),
      "expected the signed-in address on the page"
    );

    // Server Actions compare Origin against the forwarded host, which is the
    // part of the proxy setup that breaks silently when Caddy is reconfigured:
    // a same-origin call would start being treated as cross-origin. A bogus
    // action id gives a clean 404 from the same origin, so any difference here
    // means the origin guard fired.
    const fakeAction = { method: "POST", body: "{}", jar: adminJar } as const;
    const sameOrigin = await request("/rooms", {
      ...fakeAction,
      headers: { "next-action": "0".repeat(40), origin: BASE },
    });
    const foreignOrigin = await request("/rooms", {
      ...fakeAction,
      headers: { "next-action": "0".repeat(40), origin: "https://evil.example" },
    });
    check(
      "server action origin guard is active",
      foreignOrigin.status !== sameOrigin.status,
      `same-origin=${sameOrigin.status} foreign-origin=${foreignOrigin.status}`
    );
    if (HTTPS) {
      check(
        "same-origin server action reaches the handler",
        sameOrigin.status < 500,
        `status=${sameOrigin.status}`
      );
    }
  }

  const editorEmail = process.env.UAT_EDITOR_EMAIL;
  const editorPassword = process.env.UAT_EDITOR_PASSWORD;
  if (editorEmail && editorPassword) {
    const jar = await signIn(editorEmail, editorPassword);
    if (!jar) {
      check("editor can sign in", false, "sign-in failed or no cookie returned");
    } else {
      check("editor can sign in", true);
      const rooms = await request("/rooms", { jar });
      check("editor reaches /rooms", rooms.status === 200, `status=${rooms.status}`);
    }
  } else {
    skip("editor checks", "set UAT_EDITOR_EMAIL and UAT_EDITOR_PASSWORD");
  }

  const viewerEmail = process.env.UAT_VIEWER_EMAIL;
  const viewerPassword = process.env.UAT_VIEWER_PASSWORD;
  if (viewerEmail && viewerPassword) {
    const jar = await signIn(viewerEmail, viewerPassword);
    if (!jar) {
      check("viewer can sign in", false, "sign-in failed or no cookie returned");
    } else {
      check("viewer can sign in", true);
      const rooms = await request("/rooms", { jar });
      check("viewer reads /rooms", rooms.status === 200, `status=${rooms.status}`);

      // The admin page renders the user table only for ADMIN. A VIEWER gets a
      // notice instead, and the user table must not be in the HTML at all —
      // earlier the row query was simply skipped, so the emails never leaked,
      // but that is worth asserting rather than assuming.
      const admin = await request("/admin", { jar });
      const denied = admin.status === 401 || admin.status === 403 || isRedirect(admin.status);
      const leaksAdminEmail = adminEmail ? admin.body.includes(adminEmail) : false;
      const leaksViewerEmail = viewerEmail ? admin.body.includes(viewerEmail) : false;
      check(
        "viewer cannot read the admin user table",
        denied || (!leaksAdminEmail && !leaksViewerEmail),
        `status=${admin.status}${leaksAdminEmail ? " LEAKS-ADMIN" : ""}${leaksViewerEmail ? " LEAKS-VIEWER" : ""}`
      );
      check(
        "viewer sees the admin-only notice",
        denied || admin.body.includes("Admin"),
        `status=${admin.status}`
      );

      if (ALLOW_WRITES) {
        const write = await request("/rooms", {
          method: "POST",
          headers: { "next-action": "0000000000000000000000000000000000000000" },
          body: "{}",
          jar,
        });
        check(
          "viewer cannot invoke a server action",
          write.status >= 400,
          `status=${write.status}`
        );
      } else {
        skip("viewer write attempt", "set UAT_ALLOW_WRITES=1");
      }
    }
  } else {
    skip("viewer checks", "set UAT_VIEWER_EMAIL and UAT_VIEWER_PASSWORD");
  }

  // ----------------------------------------------------------------- wrap up
  const failed = results.filter((r) => r.required && !r.ok);
  const skipped = results.filter((r) => !r.required);
  console.log("");
  warn("content-security-policy", "not set by the Caddyfile; consider one after a nonce strategy");
  if (ALLOW_HTTP) warn("this run was not a production result", "http and writes disabled");
  console.log(`checks: ${results.length - skipped.length - failed.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
  if (failed.length > 0) {
    for (const item of failed) console.log(`  FAILED: ${item.name}  ${item.detail}`);
    process.exit(1);
  }
  console.log("all required checks passed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
