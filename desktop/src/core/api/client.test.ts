import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, discoverConnection } from "./client";

const client = new ApiClient({ baseUrl: "http://127.0.0.1:1", token: "tok" });

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("ApiClient", () => {
  it("sends the token and builds query strings", async () => {
    const fetch = mockFetch(200, { meta: {} });
    await client.snapshot("2026-10-05", "2026-10-09", true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:1/api/snapshot?from=2026-10-05&to=2026-10-09&fresh=1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("sends JSON bodies for settings patches", async () => {
    const fetch = mockFetch(200, {});
    await client.patchSettings({ ui: { theme: "dark" } });
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"ui":{"theme":"dark"}}');
  });

  it("turns error bodies into ApiErrors", async () => {
    mockFetch(403, { error: { kind: "login", message: "bad password" } });
    const err = await client.overview().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([err.kind, err.message, err.status]).toEqual(["login", "bad password", 403]);
  });

  it("reports an unreachable backend as a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("refused"))));
    const err = await client.status().catch((e) => e);
    expect(err.kind).toBe("network");
  });

  it("encodes lookup codes", async () => {
    const fetch = mockFetch(200, []);
    await client.who("R 1/2");
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toContain("code=R%201%2F2");
  });
});

describe("discoverConnection", () => {
  it("uses the dev backend outside of Tauri", async () => {
    expect(await discoverConnection()).toEqual({ baseUrl: "http://127.0.0.1:47800", token: "dev" });
  });
});
