import { describe, expect, it } from "vitest";
import { APP_NAME } from "./version";

describe("version", () => {
  it("expose le nom de l'application", () => {
    expect(APP_NAME).toBe("Élevage de dragodindes");
  });
});
