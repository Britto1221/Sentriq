import { SecurityActivityPage } from "@/components/security-activity-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function SecurityActivityRoute() {
  await requireNorthstarSession();
  return <SecurityActivityPage />;
}
