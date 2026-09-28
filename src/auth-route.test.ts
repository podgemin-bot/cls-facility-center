import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/[...all]/route";

describe("public auth route", () => {
  it("blocks direct public email signup", async () => {
    const request = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Public Signup",
        email: "blocked-signup@test.local",
        password: "BlockedPass123!",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
  });
});
