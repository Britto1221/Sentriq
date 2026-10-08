import { DeleteAccountPage } from "@/components/delete-account-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function DeleteAccountRoute() {
  await requireNorthstarSession();
  return <DeleteAccountPage />;
}
