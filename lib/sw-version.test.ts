import { describe, expect, it } from "vitest";
import { calculerVersion, injecterVersion, MARQUEUR } from "../scripts/sw-version.mjs";

describe("calculerVersion", () => {
  it("préfère SW_VERSION, puis le commit Vercel", () => {
    expect(calculerVersion({ SW_VERSION: "x1", VERCEL_GIT_COMMIT_SHA: "abc" })).toBe("x1");
    expect(calculerVersion({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toBe("abc123");
  });
  it("sans variable : horodatage, différent d'un build à l'autre", () => {
    expect(calculerVersion({}, 1000)).not.toBe(calculerVersion({}, 2000));
    expect(calculerVersion({}, 1000)).toMatch(/^t[0-9a-z]+$/);
  });
  it("neutralise les caractères dangereux", () => {
    expect(calculerVersion({ SW_VERSION: 'a"b`${c}' })).toBe("abc");
    expect(calculerVersion({ SW_VERSION: '"`' }, 5)).toBe("t5");
  });
});

describe("injecterVersion", () => {
  it("remplace toutes les occurrences du marqueur", () => {
    expect(injecterVersion(`const V = "${MARQUEUR}"; // ${MARQUEUR}`, "v9")).toBe('const V = "v9"; // v9');
  });
  it("échoue sans marqueur", () => {
    expect(() => injecterVersion("const V = 1;", "v9")).toThrow();
  });
});
