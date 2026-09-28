// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { getSafeCallbackURL } from "./login-form";

describe("login callback URL", () => {
  const origin = "https://cls.example.com";

  it("keeps same-origin paths", () => {
    expect(getSafeCallbackURL("/rooms?site=PKB#top", origin)).toBe("/rooms?site=PKB#top");
  });

  it.each([
    "https://evil.example/",
    "//evil.example/",
    "///evil.example/",
    "/\\evil.example/",
    "javascript:alert(1)",
    " rooms",
    null,
  ])("rejects unsafe callback %s", (candidate) => {
    expect(getSafeCallbackURL(candidate, origin)).toBe("/");
  });
});
