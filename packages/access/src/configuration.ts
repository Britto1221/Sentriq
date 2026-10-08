export const ACCESS_CONFIGURATION_METHODS = ["password", "passkey", "recovery-codes"] as const;
export type AccessConfigurationMethod = (typeof ACCESS_CONFIGURATION_METHODS)[number];

export interface AccessConfigurationSnapshot {
  source: "development-sample";
  schemaVersion: "sample-v1";
  applicationName: string;
  environment: "development";
  remotePersistence: false;
  methods: readonly AccessConfigurationMethod[];
}

/** UI adapter seam for a future configuration service. This contract is read-only until a backend exists. */
export interface AccessConfigurationAdapter {
  loadPreview(): Promise<AccessConfigurationSnapshot>;
}

export function isAccessConfigurationSnapshot(value: unknown): value is AccessConfigurationSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<AccessConfigurationSnapshot>;
  return snapshot.source === "development-sample"
    && snapshot.schemaVersion === "sample-v1"
    && typeof snapshot.applicationName === "string"
    && snapshot.environment === "development"
    && snapshot.remotePersistence === false
    && Array.isArray(snapshot.methods)
    && snapshot.methods.every((method) => ACCESS_CONFIGURATION_METHODS.includes(method as AccessConfigurationMethod));
}
