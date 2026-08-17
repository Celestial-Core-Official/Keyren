import { SignIn } from "@clerk/nextjs";
import { AuthLayout } from "@/components/marketing/auth-panel";

export default function SignInPage() {
  return (
    <AuthLayout statement="Licence keys are stored only as an HMAC. Not even we can read one back.">
      <SignIn />
    </AuthLayout>
  );
}
