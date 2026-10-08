import { AuthDemoForm } from "@/components/auth-demo-form";
import { AuthPageLayout } from "@/components/public-site";

export default function Page() {
  return <AuthPageLayout activePath="/login"><AuthDemoForm mode="login"/></AuthPageLayout>;
}
