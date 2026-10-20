// A real AppContext (built by createApp) wired to a fake API, for tests.
import { vi } from "vitest";
import type { ApiClient } from "@/core/api/client";
import type { Snapshot } from "@/core/api/types";
import type { AppContext } from "@/core/app";
import { createApp } from "@/core/bootstrap";
import type { ModuleDef } from "@/core/module";

export function fakeApi(snap: Snapshot, settings: Record<string, unknown> = {}): ApiClient {
  return {
    getSettings: vi.fn(async () => structuredClone(settings)),
    patchSettings: vi.fn(async () => ({})),
    replaceSettings: vi.fn(async (doc: unknown) => doc),
    resetSettings: vi.fn(async () => ({})),
    snapshot: vi.fn(async () => snap),
    overview: vi.fn(async () => snap),
    refresh: vi.fn(async () => ({ snapshot: snap, changes: [] })),
    status: vi.fn(async () => null),
    who: vi.fn(async () => []),
    events: vi.fn(() => () => {}),
  } as unknown as ApiClient;
}

export function testContext(snap: Snapshot, modules: ModuleDef[], settings: Record<string, unknown> = {}): Promise<AppContext> {
  return createApp(fakeApi(snap, settings), modules);
}

/** Waits for pending promises (data loads) to settle. */
export const settle = () => new Promise((r) => setTimeout(r, 0));
