import prisma from "../src/lib/prisma";
import { auth } from "../src/lib/auth";

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const EMAIL = `http-smoke-${Date.now()}@test.local`;
const PASSWORD = "SmokePass12345!";

async function main() {
  let failures = 0;

  async function signInCookie(): Promise<string> {
    const res = (await auth.api.signInEmail({
      headers: new Headers(),
      body: { email: EMAIL, password: PASSWORD, callbackURL: "/" },
      returnHeaders: true,
    })) as { headers?: Headers };
    const setCookie = res.headers?.get("set-cookie") ?? "";
    const match = /(?:__Secure-)?better-auth\.session_token=([^;]+)/.exec(setCookie);
    if (!match) throw new Error("no session cookie");
    return match[1];
  }

  async function get(url: string, cookie?: string) {
    return fetch(url, {
      redirect: "manual",
      headers: cookie ? { cookie: `better-auth.session_token=${cookie}` } : {},
    });
  }

  const signUp = (await auth.api.signUpEmail({
    body: { email: EMAIL, password: PASSWORD, name: "HTTP Smoke" },
  })) as { user?: { id: string } };

  const unauth = await get(`${BASE}/profile`);
  const unauthLoc = unauth.headers.get("location") ?? "";
  const unauthOk = unauth.status === 307 && unauthLoc.includes("/login");
  console.log(`[1/2] unauth /profile -> ${unauth.status} (location: ${unauthLoc})`);
  if (!unauthOk) failures++;

  const cookie = await signInCookie();
  const authed = await get(`${BASE}/profile`, cookie);
  const body = await authed.text();
  const authedOk = authed.status === 200 && body.includes(signUp.user?.id ?? "__no_id__");
  console.log(`[2/2] authed /profile -> ${authed.status} (has user id: ${authedOk})`);
  if (!authedOk) failures++;

  if (failures > 0) {
    console.error(`SMOKE FAILED: ${failures} assertion(s)`);
    process.exitCode = 1;
  } else {
    console.log("SMOKE OK");
  }
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
}

main().finally(cleanup);
