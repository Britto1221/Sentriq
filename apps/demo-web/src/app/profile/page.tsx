import { ProfilePage } from "@/components/profile-page";
import { requireNorthstarSession } from "@/server/require-auth";

export default async function ProfileRoute() {
  await requireNorthstarSession();
  return <ProfilePage />;
}
