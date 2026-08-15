import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { env } from "@/env";

function integrationSnippet(appUrl: string): string {
  return `const response = await fetch("${appUrl}/api/v1/licenses/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    productId: "prod_...",
    licenseKey: "KEYREN-...",
    deviceId: "your-device-fingerprint",
  }),
});

const result = await response.json();

if (!result.success) {
  throw new Error(result.error.code);
}`;
}

export default function LandingPage() {
  const snippet = integrationSnippet(env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""));
  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2">
          <span className="font-semibold tracking-tight">Keyren</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-muted-foreground">
            Alpha_v1
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get started</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </Show>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Add secure license authentication in 5 minutes.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Keyren issues and verifies software license keys so you do not have to build and
          maintain a licensing backend. One HTTP request, no server of your own.
        </p>

        <div className="mt-8 flex gap-3">
          <Show when="signed-out">
            <Button asChild>
              <Link href="/sign-up">Create an account</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          </Show>
        </div>

        <pre className="mt-14 overflow-x-auto rounded-lg border border-border bg-muted/40 p-5 text-xs leading-relaxed">
          <code>{snippet}</code>
        </pre>

        <div className="mt-14 grid gap-8 border-t border-border pt-10 sm:grid-cols-3">
          {[
            {
              title: "Keys are never stored",
              body: "Only a keyed derivation of each license key is written to the database. Plaintext is shown once, at creation.",
            },
            {
              title: "Device binding",
              body: "Lock a license to one device. Reset the binding from the dashboard when a customer changes machines.",
            },
            {
              title: "Online validation",
              body: "Alpha_v1 verifies against Keyren on every check. There are no offline licenses or cached grace periods yet.",
            },
          ].map((feature) => (
            <div key={feature.title} className="space-y-1.5">
              <h2 className="text-sm font-medium">{feature.title}</h2>
              <p className="text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
