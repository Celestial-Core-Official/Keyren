import { SignUp } from "@clerk/nextjs";
import { AuthLayout } from "@/components/marketing/auth-panel";

export default function SignUpPage() {
  return (
    <AuthLayout statement="Create an application, issue a key, and verify it with one request.">
      <SignUp />
    </AuthLayout>
  );
}
