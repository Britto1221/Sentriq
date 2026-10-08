import { IdentityFlow } from "@/components/identity-flow";

export default function SignupPage() {
  return <IdentityFlow mode="signup" developmentInboxEnabled={process.env.NODE_ENV !== "production"} />;
}
