import { DashboardPage } from "@/components/dashboard-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function DashboardRoute() {
  await requireNorthstarSession();
  return <DashboardPage />;
}
