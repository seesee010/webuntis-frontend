import type { AppContext } from "@/core/app";
import type { Message } from "@/core/api/types";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import { IdSet } from "@/core/local-state";
import { defineModule } from "@/core/module";
import type { Scope } from "@/core/reactive";
import { live } from "@/modules/dashboard/widgets";

function opt<T>(ctx: AppContext, key: string): T {
  return ctx.settings.get<T>(`messages.${key}`);
}

const readSet = (ctx: AppContext) => new IdSet(ctx.settings, "state.messages.read");

/** Read in WebUntis, or marked read in this app. */
export function isRead(ctx: AppContext, m: Message): boolean {
  return m.read || readSet(ctx).has(m.id);
}

export function visibleMessages(ctx: AppContext, list: Message[]): Message[] {
  const sorted = [...list].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return opt<boolean>(ctx, "onlyUnread") ? sorted.filter((m) => !isRead(ctx, m)) : sorted;
}

function messageRow(ctx: AppContext, m: Message): HTMLElement {
  const read = isRead(ctx, m);
  const when = m.date ? ctx.i18n.date(m.date.slice(0, 10), "dayMonth") : "";
  return h(
    "button",
    {
      type: "button",
      class: ["list-row", "msg", !read && "unread"],
      dataset: { id: m.id },
      title: ctx.i18n.t(read ? "Mark as unread (only in this app)" : "Mark as read (only in this app)"),
      onclick: () => !m.read && readSet(ctx).toggle(m.id),
    },
    h("span", { class: ["dot", !read && "ok"] }),
    h(
      "div",
      { class: "list-main" },
      h("div", null, h("strong", null, m.subject), m.hasAttachments ? icon("paperclip", 12) : null),
      opt<boolean>(ctx, "showPreview") && m.preview ? h("div", { class: "muted small" }, m.preview) : null,
    ),
    h("div", { class: "list-date right" }, h("span", { class: "small" }, m.from ?? ""), h("span", { class: "muted small" }, when)),
  );
}

function renderMessages(ctx: AppContext, scope: Scope): HTMLElement {
  const body = h("div", { class: "list-page" });
  const render = () => {
    const snap = ctx.data.overview.get();
    if (!snap) return replace(body, h("div", { class: "skeleton" }));
    readSet(ctx).prune(snap.messages.map((m) => m.id));
    const list = visibleMessages(ctx, snap.messages);
    const unread = snap.messages.filter((m) => !isRead(ctx, m)).length;
    replace(
      body,
      h(
        "section",
        { class: "card" },
        h("h2", { class: "card-title" }, ctx.i18n.t("Inbox"), h("span", { class: "chip" }, ctx.i18n.t("{n} unread", { n: unread }))),
        list.length ? list.map((m) => messageRow(ctx, m)) : h("div", { class: "empty" }, ctx.i18n.t("No messages.")),
      ),
      h("div", { class: "muted small" }, ctx.i18n.t("Clicking a message marks it read here only; open WebUntis to read the full text.")),
    );
  };
  scope.watch(ctx.data.overview, render);
  scope.watch(ctx.settings.document, render, false);
  return h("div", { class: "page narrow" }, body);
}

export default defineModule({
  id: "messages",
  title: "Messages",
  icon: "mail",
  order: 60,
  route: { path: "/messages", render: renderMessages },
  widgets: [
    {
      id: "unread-messages",
      title: "Unread messages",
      icon: "mail",
      size: "small",
      render: (ctx, scope) =>
        live(ctx, scope, (snap) => {
          const unread = snap.messages.filter((m) => !isRead(ctx, m));
          return unread.length ? unread.slice(0, 4).map((m) => messageRow(ctx, m)) : h("div", { class: "muted" }, ctx.i18n.t("Inbox zero."));
        }),
    },
  ],
  settings: [
    {
      id: "messages",
      title: "Messages",
      icon: "mail",
      order: 60,
      fields: [
        { key: "messages.onlyUnread", type: "toggle", label: "Only unread messages", default: false },
        { key: "messages.showPreview", type: "toggle", label: "Show previews", default: true },
      ],
    },
  ],
});
