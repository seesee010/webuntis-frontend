import type {
  BackendEvent,
  Change,
  ErrorInfo,
  ErrorKind,
  Lookup,
  SettingsDocument,
  Snapshot,
  Status,
} from "./types";

/** Where and how to reach untisd. */
export interface Connection {
  baseUrl: string;
  token: string;
  version?: string;
}

/** An error answered by the backend (or a failed request). */
export class ApiError extends Error implements ErrorInfo {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Resolves the backend connection: through the Tauri shell inside the
 * desktop app, from the page itself in the web edition (`untisd -web`
 * serves it with the token in a meta tag), or the fixed `untisd -dev`
 * address while developing in a browser. */
export async function discoverConnection(): Promise<Connection> {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="untis-token"]');
  if (meta?.content) return { baseUrl: location.origin, token: meta.content };
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<{ port: number; token: string; version: string }>("backend_info");
    return { baseUrl: `http://127.0.0.1:${info.port}`, token: info.token, version: info.version };
  }
  const env = import.meta.env;
  return {
    baseUrl: (env.VITE_BACKEND_URL as string | undefined) ?? "http://127.0.0.1:47800",
    token: (env.VITE_BACKEND_TOKEN as string | undefined) ?? "dev",
  };
}

/** Typed client for the untisd HTTP API. */
export class ApiClient {
  constructor(private readonly conn: Connection) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.conn.baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.conn.token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiError("network", `backend not reachable: ${(err as Error).message}`);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (data as { error?: { kind?: ErrorKind; message?: string } } | null)?.error;
      throw new ApiError(e?.kind ?? "internal", e?.message ?? res.statusText, res.status);
    }
    return data as T;
  }

  status(): Promise<Status> {
    return this.request("GET", "/api/status");
  }

  snapshot(from: string, to: string, fresh = false): Promise<Snapshot> {
    const q = new URLSearchParams({ from, to, ...(fresh ? { fresh: "1" } : {}) });
    return this.request("GET", `/api/snapshot?${q}`);
  }

  overview(fresh = false): Promise<Snapshot> {
    return this.request("GET", `/api/overview${fresh ? "?fresh=1" : ""}`);
  }

  refresh(): Promise<{ snapshot: Snapshot; changes: Change[] }> {
    return this.request("POST", "/api/refresh");
  }

  who(code: string): Promise<Lookup[]> {
    return this.request("GET", `/api/who?code=${encodeURIComponent(code)}`);
  }

  getSettings(): Promise<SettingsDocument> {
    return this.request("GET", "/api/settings");
  }

  replaceSettings(doc: SettingsDocument): Promise<SettingsDocument> {
    return this.request("PUT", "/api/settings", doc);
  }

  patchSettings(patch: SettingsDocument): Promise<SettingsDocument> {
    return this.request("PATCH", "/api/settings", patch);
  }

  resetSettings(): Promise<SettingsDocument> {
    return this.request("DELETE", "/api/settings");
  }

  /** Subscribes to the backend's server-sent events. Returns a function
   * that closes the stream. EventSource reconnects on its own. */
  events(onEvent: (ev: BackendEvent) => void, onState?: (connected: boolean) => void): () => void {
    const url = `${this.conn.baseUrl}/api/events?token=${encodeURIComponent(this.conn.token)}`;
    const source = new EventSource(url);
    const types: BackendEvent["type"][] = ["snapshot", "changes", "error", "settings", "provider"];
    for (const t of types) {
      source.addEventListener(t, (msg) => {
        try {
          onEvent(JSON.parse((msg as MessageEvent<string>).data) as BackendEvent);
        } catch {
          /* ignore malformed events */
        }
      });
    }
    source.onopen = () => onState?.(true);
    source.onerror = () => onState?.(false);
    return () => source.close();
  }
}
