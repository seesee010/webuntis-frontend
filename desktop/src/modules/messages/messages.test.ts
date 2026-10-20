import { describe, expect, it } from "vitest";
import type { Message } from "@/core/api/types";
import { Scope } from "@/core/reactive";
import { settle, testContext } from "@/test/ctx";
import { snapshot } from "@/test/fixtures";
import messages from "./index";

const msg = (id: string, date: string, read = false): Message => ({ id, subject: `Subject ${id}`, preview: "Preview", from: "Office", date, read, hasAttachments: id === "2" });

describe("messages", () => {
  const snap = snapshot({ messages: [msg("1", "2026-10-01T08:00:00", true), msg("2", "2026-10-05T08:00:00"), msg("3", "2026-10-03T08:00:00")] });

  it("lists newest first, marks read locally and filters unread", async () => {
    const ctx = await testContext(snap, [messages]);
    await ctx.data.loadOverview();
    const el = messages.route!.render(ctx, new Scope(), new URLSearchParams());
    await settle();
    const ids = () => [...el.querySelectorAll<HTMLElement>(".list-row")].map((r) => r.dataset.id);
    expect(ids()).toEqual(["2", "3", "1"]);
    expect(el.querySelector(".card-title .chip")!.textContent).toBe("2 unread");
    (el.querySelector('[data-id="3"]') as HTMLButtonElement).click();
    expect(ctx.settings.get("state.messages.read")).toEqual(["3"]);
    expect(el.querySelector(".card-title .chip")!.textContent).toBe("1 unread");
    ctx.settings.set("messages.onlyUnread", true);
    expect(ids()).toEqual(["2"]);
  });

  it("widget lists unread messages", async () => {
    const ctx = await testContext(snap, [messages]);
    await ctx.data.loadOverview();
    expect(messages.widgets![0].render(ctx, new Scope()).querySelectorAll(".list-row")).toHaveLength(2);
  });
});
