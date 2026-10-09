import { describe, expect, it } from "vitest";
import { describeMigrationFailure } from "./migration-error";

describe("describeMigrationFailure", () => {
  it("keeps the migration phase and safe error code", () => {
    expect(describeMigrationFailure("database-open", Object.assign(new Error("database unavailable"), { code: "ENOENT" })))
      .toBe("Security API migration failed (phase=database-open, error=Error code=ENOENT): database unavailable");
  });

  it("redacts filesystem paths and secret-like values", () => {
    const message = "failed at C:\\app\\data\\store with api_key=do-not-log";
    const result = describeMigrationFailure("database-open", new Error(message));
    expect(result).toContain("[path]");
    expect(result).toContain("api_key=[redacted]");
    expect(result).not.toContain("do-not-log");
    expect(result).not.toContain("C:\\app");
  });

  it("reports known migration validation failures without exposing inputs", () => {
    expect(describeMigrationFailure("migration", new Error("Applied migration checksum mismatch")))
      .toContain("Applied migration checksum mismatch");
  });
});
