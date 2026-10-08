import { SecuritySettingsPage } from "@/components/security-settings-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function SecuritySettingsRoute() {
  await requireNorthstarSession();
  return <SecuritySettingsPage />;
}
