import { ExportPage } from "@/components/export-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function ExportRoute() {
  await requireNorthstarSession();
  return <ExportPage />;
}
