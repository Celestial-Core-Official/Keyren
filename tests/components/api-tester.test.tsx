import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiTester, disposableDeviceId } from "@/components/products/api-tester";
import { VERIFY_PATH } from "@/lib/release";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const KEY = "KEYREN-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function sendRequest(key = KEY) {
  const user = userEvent.setup();
  render(<ApiTester productId="prod_abc" />);

  await user.type(screen.getByLabelText(/license key/i), key);
  await user.click(screen.getByRole("button", { name: /send request/i }));

  return user;
}

describe("ApiTester — the request", () => {
  it("posts to the real public endpoint", async () => {
    // Not a private test route: the point is to prove the thing customers hit
    // works, rate limiter and all.
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, license: { status: "active", expiresAt: null } }),
    );

    await sendRequest();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe(VERIFY_PATH);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST" });
  });

  it("sends the three fields the API expects, and no others", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await sendRequest();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    ) as Record<string, string>;

    expect(Object.keys(body).sort()).toEqual(["deviceId", "licenseKey", "productId"]);
    expect(body.productId).toBe("prod_abc");
    expect(body.licenseKey).toBe(KEY);
  });

  it("cannot be submitted with an empty key", () => {
    render(<ApiTester productId="prod_abc" />);
    expect(
      screen.getByRole("button", { name: /send request/i }).hasAttribute("disabled"),
    ).toBe(true);
  });
});

describe("ApiTester — device identity", () => {
  it("defaults to an obviously disposable device id", () => {
    render(<ApiTester productId="prod_abc" />);

    const device = (screen.getByLabelText("Device ID") as HTMLInputElement).value;
    expect(device).toMatch(/^keyren-dashboard-test-/);
  });

  it("generates a different id on each call", () => {
    expect(disposableDeviceId()).not.toBe(disposableDeviceId());
  });

  it("uses a fresh id per test by default", async () => {
    // An HWID-locked license binds to the first device that authenticates.
    // Reusing one id would claim the license for the dashboard and leave the
    // real customer locked out.
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    const user = await sendRequest();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /send request/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const first = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const second = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(first.deviceId).not.toBe(second.deviceId);
  });

  it("lets the developer pin a specific device id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    const user = userEvent.setup();
    render(<ApiTester productId="prod_abc" />);

    await user.click(screen.getByRole("checkbox"));
    await user.clear(screen.getByLabelText("Device ID"));
    await user.type(screen.getByLabelText("Device ID"), "my-laptop");
    await user.type(screen.getByLabelText(/license key/i), KEY);
    await user.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.deviceId).toBe("my-laptop");
  });

  it("warns that testing claims a device-locked license", () => {
    render(<ApiTester productId="prod_abc" />);
    expect(document.body.textContent).toMatch(/claims it/i);
    expect(document.body.textContent).toMatch(/DEVICE_MISMATCH/);
  });
});

describe("ApiTester — results", () => {
  it("shows the status, the duration and the formatted body on success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { success: true, license: { status: "active", expiresAt: null } }),
    );

    await sendRequest();

    expect(await screen.findByText("HTTP 200")).toBeTruthy();
    expect(screen.getByText(/\d+ ms/)).toBeTruthy();
    expect(document.body.textContent).toContain('"status": "active"');
  });

  it.each([
    [403, "LICENSE_INVALID"],
    [403, "LICENSE_REVOKED"],
    [403, "LICENSE_EXPIRED"],
    [403, "DEVICE_MISMATCH"],
    [404, "PRODUCT_INVALID"],
    [400, "BAD_REQUEST"],
    [500, "INTERNAL_ERROR"],
  ])("surfaces a %i %s response verbatim", async (status, code) => {
    fetchMock.mockResolvedValue(
      jsonResponse(status, { success: false, error: { code, message: "..." } }),
    );

    await sendRequest();

    expect(await screen.findByText(`HTTP ${status}`)).toBeTruthy();
    expect(document.body.textContent).toContain(code);
  });

  it("shows the retry-after header when rate limited", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        429,
        { success: false, error: { code: "RATE_LIMITED", message: "..." } },
        { "retry-after": "37" },
      ),
    );

    await sendRequest();

    expect(await screen.findByText("HTTP 429")).toBeTruthy();
    expect(screen.getByText("retry-after: 37")).toBeTruthy();
  });

  it("explains a DEVICE_MISMATCH rather than only printing it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { success: false, error: { code: "DEVICE_MISMATCH", message: "..." } }),
    );

    await sendRequest();

    expect(await screen.findByText(/to let a new device claim it/i)).toBeTruthy();
  });

  it("shows a non-JSON body verbatim instead of failing to parse it", async () => {
    // A 502 from a load balancer is frequently HTML, and this panel should
    // show that faithfully — it is exactly the case the snippets warn about.
    fetchMock.mockResolvedValue(
      new Response("<html><body>502 Bad Gateway</body></html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    );

    await sendRequest();

    expect(await screen.findByText("HTTP 502")).toBeTruthy();
    expect(screen.getByText(/was not JSON/i)).toBeTruthy();
    expect(document.body.textContent).toContain("502 Bad Gateway");
  });

  it("reports a network failure without leaking the exception text", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch: ECONNREFUSED 127.0.0.1"));

    await sendRequest();

    expect(await screen.findByText(/never reached Keyren/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain("ECONNREFUSED");
  });

  it("announces the result politely", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await sendRequest();

    await screen.findByText("HTTP 200");
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("HTTP 200");
  });

  it("clears a previous result on request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    const user = await sendRequest();

    await screen.findByText("HTTP 200");
    await user.click(screen.getByRole("button", { name: /clear result/i }));

    expect(screen.queryByText("HTTP 200")).toBeNull();
  });
});

describe("ApiTester — the key is never persisted", () => {
  it("writes nothing to storage", async () => {
    localStorage.clear();
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));

    await sendRequest();
    await screen.findByText("HTTP 200");

    expect(JSON.stringify(localStorage)).not.toContain("KEYREN");
    expect(JSON.stringify(sessionStorage)).not.toContain("KEYREN");
  });

  it("starts blank rather than remembering the last key", () => {
    render(<ApiTester productId="prod_abc" />);
    expect((screen.getByLabelText(/license key/i) as HTMLInputElement).value).toBe("");
  });

  it("sends the key in the body, never in the URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    await sendRequest();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain("KEYREN");
  });
});
