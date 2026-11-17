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

  it("streams events from the id it saw last and passes on the change ids", () => {
    const sources: { url: string; listeners: Record<string, (m: MessageEvent<string>) => void> }[] = [];
    vi.stubGlobal(
      "EventSource",
      class {
        listeners: Record<string, (m: MessageEvent<string>) => void> = {};
        constructor(readonly url: string) {
          sources.push(this);
        }
        addEventListener(type: string, fn: (m: MessageEvent<string>) => void) {
          this.listeners[type] = fn;
        }
        close() {}
      },
    );
    const seen: unknown[] = [];
    client.events((ev) => seen.push(ev), undefined, "1763370000000007");
    expect(sources[0].url).toBe("http://127.0.0.1:1/api/events?token=tok&since=1763370000000007");

    const send = (type: string, id: string) => sources[0].listeners[type]({ data: JSON.stringify({ type, at: "" }), lastEventId: id } as MessageEvent<string>);
    send("changes", "1763370000000008");
    send("snapshot", "1763370000000008"); // EventSource keeps the last id on every later event
    expect(seen).toEqual([{ type: "changes", at: "", id: "1763370000000008" }, { type: "snapshot", at: "" }]);

    client.events(() => {}); // no id yet: no since
    expect(sources[1].url).toBe("http://127.0.0.1:1/api/events?token=tok");
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

  it("uses the serving backend in the web edition", async () => {
    const meta = document.head.appendChild(Object.assign(document.createElement("meta"), { name: "untis-token", content: "web-tok" }));
    expect(await discoverConnection()).toEqual({ baseUrl: location.origin, token: "web-tok" });
    meta.remove();
  });
});
