import { describe, expect, it } from "vitest";
import { createLocalAccessConfigurationAdapter } from "./access-configuration-adapter";

describe("local Access configuration adapter", () => {
  it("returns a development sample without remote persistence", async () => {
    const snapshot = await createLocalAccessConfigurationAdapter().loadPreview();
    expect(snapshot.source).toBe("development-sample");
    expect(snapshot.remotePersistence).toBe(false);
    expect(snapshot.methods).toEqual(["password", "passkey", "recovery-codes"]);
  });
});
