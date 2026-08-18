"use client";

import { useState } from "react";
import { FlaskConical, RefreshCw } from "lucide-react";
import { SubmitButton } from "@/components/dashboard/feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Note } from "@/components/ui/note";
import { VERIFY_PATH } from "@/lib/release";
import { cn } from "@/lib/utils";

/**
 * Sends a real request to the real public endpoint.
 *
 * Deliberately not a server action or a private "test" route: the point of
 * this panel is to prove the thing a customer's software will hit actually
 * works, including its rate limiter and its exact response envelope. A
 * shortcut around either would make a green result meaningless.
 *
 * The license key is component state and nothing else. It is never written to
 * storage, never put in the URL, and never sent anywhere except the endpoint
 * it is being tested against.
 */

export type TesterResult = {
  status: number;
  durationMs: number;
  headers: { name: string; value: string }[];
  body: string;
  parsed: boolean;
  ok: boolean;
};

/** Headers worth surfacing. Everything else is transport noise. */
const INTERESTING_HEADERS = ["retry-after", "content-type"];

/**
 * A device id that is obviously disposable and obviously not a real customer.
 *
 * Randomised per test by default, because an HWID-locked license binds to the
 * first device that authenticates — testing with a fixed id would claim the
 * license for the dashboard and leave the actual customer locked out.
 */
export function disposableDeviceId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  return `keyren-dashboard-test-${random}`;
}

export function ApiTester({ applicationId }: { applicationId: string }) {
  const [licenseKey, setLicenseKey] = useState("");
  const [freshDevice, setFreshDevice] = useState(true);
  const [deviceId, setDeviceId] = useState(disposableDeviceId);
  const [result, setResult] = useState<TesterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;

    setRunning(true);
    setError(null);
    setResult(null);

    const device = freshDevice ? disposableDeviceId() : deviceId;
    if (freshDevice) setDeviceId(device);

    const startedAt = performance.now();

    try {
      const response = await fetch(VERIFY_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, licenseKey, deviceId: device }),
      });

      // Read as text, exactly as the snippets advise: a proxy answering a 429
      // or a 502 with HTML is precisely the case this panel should show
      // faithfully rather than turn into a parse error.
      const raw = await response.text();

      let pretty = raw;
      let parsed = false;
      try {
        pretty = `${JSON.stringify(JSON.parse(raw), null, 2)}`;
        parsed = true;
      } catch {
        parsed = false;
      }

      setResult({
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        headers: INTERESTING_HEADERS.flatMap((name) => {
          const value = response.headers.get(name);
          return value ? [{ name, value }] : [];
        }),
        body: pretty,
        parsed,
        ok: response.ok,
      });
    } catch {
      // A network failure, a DNS failure, or the request being blocked. No
      // exception text: it varies per browser and says nothing useful.
      setError(
        "The request never reached Keyren. Check that the app is running and reachable from this browser.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card id="api-tester" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4" />
          Test a license
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Sends a real request to <code className="font-mono text-xs">{VERIFY_PATH}</code>
          , through the same rate limiter your customers hit. Nothing typed here is saved.
        </p>

        <form onSubmit={run} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tester-key">License key</Label>
            <Input
              id="tester-key"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              placeholder="KEYREN-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
              required
            />
            <p className="text-xs text-muted-foreground">
              Paste a key you saved — Keyren cannot look one up.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tester-device">Device ID</Label>
            <Input
              id="tester-device"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              disabled={freshDevice}
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={freshDevice}
                onChange={(event) => setFreshDevice(event.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="text-muted-foreground">
                Use a new disposable device ID for each test
              </span>
            </label>
          </div>

          <Note tone="warning" label="This is the real endpoint">
            Testing a device-locked license <strong className="font-medium">claims it</strong>.
            An unactivated key binds to this test, and the customer gets DEVICE_MISMATCH
            until you reset it.
          </Note>

          <div className="flex items-center gap-2">
            <SubmitButton disabled={running || licenseKey.trim() === ""} pendingLabel="Sending…">
              Send request
            </SubmitButton>
            {result || error ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
              >
                <RefreshCw className="size-3.5" />
                Clear result
              </Button>
            ) : null}
          </div>
        </form>

        {/* Polite rather than assertive: the result is worth announcing but
            never worth interrupting something else being read. */}
        <div aria-live="polite" className="space-y-3">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
              {error}
            </div>
          ) : null}

          {result ? (
            <>
              {/* One container: a response header bar over the body, matching
                  the shape of the code card on the Integrate page so the two
                  surfaces rhyme. */}
              <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 font-mono text-[12px]">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        result.ok ? "bg-success" : "bg-destructive",
                      )}
                      aria-hidden="true"
                    />
                    <span className={result.ok ? "text-success" : "text-destructive"}>
                      HTTP {result.status}
                    </span>
                  </span>
                  <span className="text-fg-quaternary" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-fg-tertiary tabular-nums">{result.durationMs} ms</span>
                  {result.headers.map((header) => (
                    <span key={header.name} className="truncate text-fg-quaternary">
                      {header.name}: {header.value}
                    </span>
                  ))}
                  {!result.parsed ? (
                    <span className="text-warning">Not JSON — shown verbatim</span>
                  ) : null}
                </div>

                <pre className="max-h-72 overflow-auto px-3 py-2.5 font-mono text-[13px] leading-5">
                  <code>{result.body}</code>
                </pre>
              </div>

              {result.status === 403 && result.body.includes("DEVICE_MISMATCH") ? (
                <p className="text-sm text-muted-foreground">
                  This license is already bound to another device. Reset its activation
                  from the licenses table to let a new device claim it.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
