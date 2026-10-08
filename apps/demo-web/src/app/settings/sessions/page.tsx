import { SessionsPage } from "@/components/sessions-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function SessionsRoute() {
  await requireNorthstarSession();
  return <SessionsPage />;
}
