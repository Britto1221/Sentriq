import { describe, expect, it } from "vitest";
import { ACCESS_CONFIGURATION_METHODS, isAccessConfigurationSnapshot, type AccessConfigurationSnapshot } from "./configuration";

describe("Access configuration preview contract", () => {
  it("accepts only a local, non-persistent development snapshot", () => {
    const sample: AccessConfigurationSnapshot = {
      source: "development-sample",
      schemaVersion: "sample-v1",
      applicationName: "Sentriq developer console",
      environment: "development",
      remotePersistence: false,
      methods: ACCESS_CONFIGURATION_METHODS,
    };
    expect(isAccessConfigurationSnapshot(sample)).toBe(true);
    expect(isAccessConfigurationSnapshot({ ...sample, remotePersistence: true })).toBe(false);
    expect(isAccessConfigurationSnapshot({ ...sample, source: "remote" })).toBe(false);
  });
});
