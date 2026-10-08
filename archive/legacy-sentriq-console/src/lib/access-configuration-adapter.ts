import {
  ACCESS_CONFIGURATION_METHODS,
  type AccessConfigurationAdapter,
  type AccessConfigurationSnapshot,
} from "@sentriq/access";

const localPreview: AccessConfigurationSnapshot = {
  source: "development-sample",
  schemaVersion: "sample-v1",
  applicationName: "Sentriq developer console",
  environment: "development",
  remotePersistence: false,
  methods: ACCESS_CONFIGURATION_METHODS,
};

/** Local read-only fixture. Replace this adapter only when a configuration API is available. */
export function createLocalAccessConfigurationAdapter(): AccessConfigurationAdapter {
  return {
    async loadPreview() {
      return { ...localPreview, methods: [...localPreview.methods] };
    },
  };
}
