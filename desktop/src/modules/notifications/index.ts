import type { AppContext } from "@/core/app";
import type { Change } from "@/core/api/types";
import { toISO } from "@/core/dates";
import { h } from "@/core/dom";
import { defineModule } from "@/core/module";
import type { Field } from "@/core/schema";
import { live } from "@/modules/dashboard/widgets";
import { changeKinds, describe, inQuietHours } from "./describe";
import { createNotifier, type Notifier } from "./notifier";

const HISTORY = "state.notifications.history";

interface Logged {
  at: string;
  change: Change;
}

let notifier: Promise<Notifier> | null = null;
/** The notifier; replaceable in tests. */
export function getNotifier(): Promise<Notifier> {
  return (notifier ??= createNotifier());
}
export function setNotifier(n: Notifier | null): void {
  notifier = n ? Promise.resolve(n) : null;
}

function opt<T>(ctx: AppContext, key: string): T {
  return ctx.settings.get<T>(`notifications.${key}`);
}

/** The changes the user wants to hear about. */
export function wanted(ctx: AppContext, changes: Change[], todayISO: string): Change[] {
  return changes.filter(
    (c) => opt<boolean>(ctx, `kinds.${c.kind}`) && !(opt<boolean>(ctx, "onlyUpcoming") && c.date && c.date < todayISO),
  );
}

const subjectName = (ctx: AppContext) => (code: string) => ctx.display.subjectName({ short: code });

/** Shows toasts and desktop notifications for a batch of changes. */
export async function announce(ctx: AppContext, changes: Change[], now = new Date()): Promise<void> {
  const todayISO = toISO(now);
  const list = wanted(ctx, changes, todayISO);
  if (!list.length) return;

  const history = [...list.map((change) => ({ at: now.toISOString(), change })), ...ctx.settings.get<Logged[]>(HISTORY, [])];
  ctx.settings.set(HISTORY, history.slice(0, opt<number>(ctx, "historySize")));

  const max = opt<number>(ctx, "maxSeparate");
  const texts = list.map((c) => describe(ctx.i18n, c, subjectName(ctx)));
  const grouped = texts.length > max ? [{ title: ctx.i18n.plural(texts.length, "{n} change in your timetable", "{n} changes in your timetable"), body: texts.map((t) => t.title).join("\n") }] : texts;

  if (opt<boolean>(ctx, "toasts")) for (const t of grouped) ctx.toasts.show("info", t.title, t.body, opt<number>(ctx, "toastSeconds") * 1000);

  const hhmm = now.toTimeString().slice(0, 5);
  if (opt<boolean>(ctx, "desktop") && !inQuietHours(hhmm, opt(ctx, "quietFrom"), opt(ctx, "quietTo"))) {
    const n = await getNotifier();
    if (await n.permitted()) for (const t of grouped) await n.send(t.title, t.body);
  }
}

function testButton(ctx: AppContext): HTMLElement {
  const status = h("span", { class: "muted small" });
  const btn = h("button", { type: "button", class: "btn" }, ctx.i18n.t("Send a test notification"));
  btn.addEventListener("click", async () => {
    const n = await getNotifier();
    if (n.name === "none") return void (status.textContent = ctx.i18n.t("Desktop notifications are not supported here."));
    if (!(await n.permitted()) && !(await n.request())) return void (status.textContent = ctx.i18n.t("Permission was denied."));
    await n.send(ctx.i18n.t("Untis"), ctx.i18n.t("Notifications work."));
    status.textContent = ctx.i18n.t("Sent.");
  });
  return h("div", { class: "row-inline" }, btn, status);
}

const kindFields: Field[] = changeKinds.map(({ kind, label, defaultOn }) => ({
  key: `notifications.kinds.${kind}`,
  type: "toggle",
  label,
  default: defaultOn,
  keywords: ["notify", "alert"],
}));

export default defineModule({
  id: "notifications",
  title: "Notifications",
  icon: "bell",
  setup(ctx) {
    return ctx.bus.on("changes", (changes) => void announce(ctx, changes));
  },
  widgets: [
    {
      id: "recent-changes",
      title: "Recent notifications",
      icon: "bell",
      size: "small",
      enabledByDefault: false,
      render: (ctx, scope) =>
        live(ctx, scope, () => {
          const items = ctx.settings.get<Logged[]>(HISTORY, []).slice(0, 6);
          if (!items.length) return h("div", { class: "muted" }, ctx.i18n.t("No changes noticed yet."));
          return items.map(({ change }) => {
            const d = describe(ctx.i18n, change, subjectName(ctx));
            return h("div", { class: "list-row" }, h("div", { class: "list-main" }, h("strong", null, d.title), d.body ? h("div", { class: "muted small" }, d.body) : null));
          });
        }),
    },
  ],
  settings: [
    {
      id: "notifications",
      title: "Notifications",
      icon: "bell",
      order: 75,
      description: "When a refresh finds changes (Settings › Data source › Detect changes), tell me about them.",
      fields: [
        { key: "notifications.toasts", type: "toggle", label: "In-app messages", default: true },
        { key: "notifications.toastSeconds", type: "number", label: "Show in-app messages for", default: 8, min: 0, max: 120, unit: "s", description: "0 keeps them until dismissed." },
        { key: "notifications.desktop", type: "toggle", label: "Desktop notifications", default: false },
        { key: "notifications.test", type: "custom", label: "Test", default: null, render: testButton, wide: false },
        { key: "notifications.quietFrom", type: "text", label: "Quiet hours from", description: "No desktop notifications between these times (HH:MM). Empty turns quiet hours off.", default: "", placeholder: "22:00" },
        { key: "notifications.quietTo", type: "text", label: "Quiet hours until", default: "", placeholder: "06:30" },
        { key: "notifications.onlyUpcoming", type: "toggle", label: "Ignore changes in the past", default: true },
        { key: "notifications.maxSeparate", type: "number", label: "Group when more than", description: "More changes at once are summed up in one message.", default: 3, min: 1, max: 20, unit: "changes" },
        { key: "notifications.historySize", type: "number", label: "Remember the last", default: 50, min: 0, max: 500, unit: "changes" },
      ],
    },
    { id: "notification-kinds", title: "Notify me about", icon: "bell", order: 76, fields: kindFields },
  ],
});
