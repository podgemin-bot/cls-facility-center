import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";

const EMAIL = `profile-test-${Date.now()}@test.local`;
const ORIGINAL_PASSWORD = "OldPass12345!";
const NEW_PASSWORD = "NewPass54321!";

let userId = "";
let sessionToken = "";
let secondSessionToken = "";
let refreshedToken = "";

function sessionHeaders(token: string): Headers {
  const headers = new Headers();
  headers.set("cookie", `better-auth.session_token=${token}`);
  return headers;
}

function extractSessionToken(setCookieHeader: string | null): string {
  expect(setCookieHeader).toBeTruthy();
  const match = /(?:__Secure-)?better-auth\.session_token=([^;]+)/.exec(setCookieHeader ?? "");
  expect(match).toBeTruthy();
  return match![1] ?? "";
}

async function signInToken(email: string, password: string): Promise<string> {
  const res = (await auth.api.signInEmail({
    headers: new Headers(),
    body: { email, password, callbackURL: "/" },
    returnHeaders: true,
    returnStatus: true,
  })) as { headers?: Headers; response?: unknown };
  return extractSessionToken(res.headers?.get("set-cookie") ?? null);
}

async function signInOk(email: string, password: string): Promise<boolean> {
  try {
    const res = (await auth.api.signInEmail({
      headers: new Headers(),
      body: { email, password, callbackURL: "/" },
    })) as { user?: { id: string }; session?: { token: string } };
    return Boolean(res?.user ?? res?.session);
  } catch {
    return false;
  }
}

async function getSession(token: string) {
  return auth.api.getSession({ headers: sessionHeaders(token) });
}

beforeAll(async () => {
  const signUp = (await auth.api.signUpEmail({
    body: { email: EMAIL, password: ORIGINAL_PASSWORD, name: "โปรไฟล์ทดสอบ" },
  })) as { user?: { id: string } };
  if (!signUp?.user?.id) throw new Error("signUpEmail failed");
  userId = signUp.user.id;
});

afterAll(async () => {
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("Profile auth flows (real better-auth)", () => {
  it("signs in with the correct credentials and rejects wrong ones", async () => {
    expect(await signInOk(EMAIL, ORIGINAL_PASSWORD)).toBe(true);
    expect(await signInOk(EMAIL, "WrongPass999!")).toBe(false);
  });

  it("resolves the current session from the signed cookie", async () => {
    sessionToken = await signInToken(EMAIL, ORIGINAL_PASSWORD);
    const session = await getSession(sessionToken);
    expect(session?.user?.id).toBe(userId);
    expect(session?.user?.email).toBe(EMAIL);
  });

  it("rejects forged and expired session cookies", async () => {
    expect(await getSession("forged-token.forged-signature")).toBeNull();

    const expiredToken = await signInToken(EMAIL, ORIGINAL_PASSWORD);
    const rawToken = decodeURIComponent(expiredToken).split(".")[0];
    await prisma.session.update({
      where: { token: rawToken },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect(await getSession(expiredToken)).toBeNull();
  });

  it("updates the display name end to end", async () => {
    const res = (await auth.api.updateUser({
      headers: sessionHeaders(sessionToken),
      body: { name: "ชื่อใหม่ทดสอบ" },
    })) as { status?: boolean };
    expect(res.status).toBe(true);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(updated.name).toBe("ชื่อใหม่ทดสอบ");
  });

  it("rejects changing the password with a wrong current password", async () => {
    let threw = false;
    try {
      await auth.api.changePassword({
        headers: sessionHeaders(sessionToken),
        body: {
          currentPassword: "TotallyWrong!",
          newPassword: NEW_PASSWORD,
          revokeOtherSessions: true,
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    expect(await signInOk(EMAIL, ORIGINAL_PASSWORD)).toBe(true);
    expect(await signInOk(EMAIL, NEW_PASSWORD)).toBe(false);
  });

  it("changes the password when the current one is correct", async () => {
    secondSessionToken = await signInToken(EMAIL, ORIGINAL_PASSWORD);
    expect(await getSession(secondSessionToken)).toBeTruthy();

    const res = (await auth.api.changePassword({
      headers: sessionHeaders(sessionToken),
      body: {
        currentPassword: ORIGINAL_PASSWORD,
        newPassword: NEW_PASSWORD,
        revokeOtherSessions: true,
      },
      returnHeaders: true,
    })) as { headers?: Headers; response?: { token?: string } };
    refreshedToken = extractSessionToken(res.headers?.get("set-cookie") ?? null);
    expect(refreshedToken).toBeTruthy();

    expect(await signInOk(EMAIL, ORIGINAL_PASSWORD)).toBe(false);
    expect(await signInOk(EMAIL, NEW_PASSWORD)).toBe(true);
  });

  it("revokes every old session and keeps only the refreshed one", async () => {
    expect(await getSession(sessionToken)).toBeNull();
    expect(await getSession(secondSessionToken)).toBeNull();
    expect(await getSession(refreshedToken)).toMatchObject({ user: { id: userId } });
  });
});

describe("Profile session management (real better-auth)", () => {
  const rawToken = (encoded: string) => decodeURIComponent(encoded).split(".")[0];

  it("lists every active session of the user", async () => {
    const t1 = await signInToken(EMAIL, NEW_PASSWORD);
    const t2 = await signInToken(EMAIL, NEW_PASSWORD);

    const list = (await auth.api.listSessions({
      headers: sessionHeaders(t1),
    })) as unknown as { token: string }[] | null;

    const tokens = (list ?? []).map((s) => s.token);
    expect(tokens).toContain(rawToken(t1));
    expect(tokens).toContain(rawToken(t2));
    expect(await getSession(t2)).toMatchObject({ user: { id: userId } });
  });

  it("revokes a single other session and keeps the rest", async () => {
    const t1 = await signInToken(EMAIL, NEW_PASSWORD);
    const t2 = await signInToken(EMAIL, NEW_PASSWORD);

    const res = (await auth.api.revokeSession({
      headers: sessionHeaders(t1),
      body: { token: rawToken(t2) },
    })) as unknown;
    expect(res).toBeTruthy();
    expect(await getSession(t2)).toBeNull();
    expect(await getSession(t1)).toMatchObject({ user: { id: userId } });
  });

  it("revokes all other sessions keeping only the current one", async () => {
    const t1 = await signInToken(EMAIL, NEW_PASSWORD);
    const t2 = await signInToken(EMAIL, NEW_PASSWORD);

    const res = (await auth.api.revokeOtherSessions({
      headers: sessionHeaders(t1),
    })) as unknown;
    expect(res).toBeTruthy();
    expect(await getSession(t1)).toMatchObject({ user: { id: userId } });
    expect(await getSession(t2)).toBeNull();
  });
});
