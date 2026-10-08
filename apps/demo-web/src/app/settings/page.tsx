import { SettingsHomePage } from "@/components/settings-home-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function SettingsRoute() {
  await requireNorthstarSession();
  return <SettingsHomePage />;
}
