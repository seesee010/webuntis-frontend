import type { AppContext } from "@/core/app";
import { h, replace } from "@/core/dom";
import { icon } from "@/core/icons";
import { Scope } from "@/core/reactive";
import type { ErrorInfo } from "@/core/api/types";

/** Builds the application frame and swaps views on navigation. */
export function mountShell(root: HTMLElement, ctx: AppContext): void {
  const scope = new Scope();
  const content = h("main", { class: "content", attrs: { tabindex: "-1" } });
  const title = h("h1", { class: "topbar-title" });
  const banner = h("div", { class: "banner-slot" });

  const app = h(
    "div",
    { class: "app" },
    sidebar(ctx, scope),
    h("div", { class: "main" }, h("header", { class: "topbar" }, title, h("div", { class: "spacer" }), statusArea(ctx, scope)), banner, content),
    toasts(ctx, scope),
  );
  replace(root, app);

  scope.watch(ctx.data.error, (err) => replace(banner, err ? errorBanner(ctx, err) : null));

  let viewScope: Scope | null = null;
  scope.watch(ctx.router.route, (route) => {
    const mod = ctx.modules.routeFor(route.path);
    if (!mod?.route) {
      const first = ctx.modules.all().find((m) => m.route && m.route.nav !== false);
      if (first?.route) ctx.router.navigate(first.route.path);
      return;
    }
    viewScope?.dispose();
    viewScope = scope.child();
    title.textContent = mod.title;
    document.title = `${mod.title} · Untis`;
    try {
      replace(content, mod.route.render(ctx, viewScope, route.params));
    } catch (err) {
      console.error(err);
      replace(content, h("div", { class: "empty" }, `This view failed to render: ${(err as Error).message}`));
    }
    content.scrollTop = 0;
  });
}

function sidebar(ctx: AppContext, scope: Scope): HTMLElement {
  const nav = h("nav", { class: "nav" });
  const items = ctx.modules
    .all()
    .filter((m) => m.route && m.route.nav !== false)
    .map((m) =>
      h(
        "a",
        { class: "nav-item", href: `#${m.route!.path}`, dataset: { path: m.route!.path }, title: m.title },
        icon(m.icon, 18),
        h("span", { class: "nav-label" }, m.title),
      ),
    );
  replace(nav, items);
  scope.watch(ctx.router.route, (r) => {
    for (const a of items) a.classList.toggle("active", a.dataset.path === r.path);
  });

  const collapse = h("button", { class: "icon-btn nav-collapse", title: "Collapse sidebar", attrs: { "aria-label": "Collapse sidebar" } }, icon("menu"));
  const aside = h(
    "aside",
    { class: "sidebar" },
    h("div", { class: "brand" }, collapse, h("span", { class: "brand-name" }, "Untis")),
    nav,
    h("div", { class: "sidebar-foot" }, providerBadge(ctx, scope)),
  );
  scope.watch(ctx.settings.document, () => aside.classList.toggle("collapsed", ctx.settings.get("ui.sidebarCollapsed", false)));
  collapse.addEventListener("click", () => ctx.settings.set("ui.sidebarCollapsed", !ctx.settings.get("ui.sidebarCollapsed", false)));
  return aside;
}

function providerBadge(ctx: AppContext, scope: Scope): HTMLElement {
  const dot = h("span", { class: "dot" });
  const label = h("span", { class: "nav-label" });
  const el = h("div", { class: "provider-badge", title: "Data source" }, dot, label);
  const render = () => {
    const provider = ctx.data.status.get()?.service.provider;
    const connected = ctx.data.connected.get();
    dot.className = `dot ${connected ? "ok" : "bad"}`;
    label.textContent = !connected ? "Backend offline" : provider === "cli" ? "untis CLI" : provider ? "Sample data" : "…";
  };
  scope.watch(ctx.data.status, render);
  scope.watch(ctx.data.connected, render);
  return el;
}

function statusArea(ctx: AppContext, scope: Scope): HTMLElement {
  const when = h("span", { class: "muted small" });
  const btn = h("button", { class: "icon-btn", title: "Refresh now", attrs: { "aria-label": "Refresh now" } }, icon("refresh"));
  btn.addEventListener("click", async () => {
    try {
      const changes = await ctx.data.refresh();
      ctx.toasts.show("success", "Refreshed", changes.length ? `${changes.length} change(s) detected` : "No changes", 2500);
    } catch (err) {
      ctx.toasts.show("error", "Refresh failed", (err as Error).message);
    }
  });
  scope.watch(ctx.data.loading, (l) => btn.classList.toggle("spinning", l));
  const render = () => {
    const at = ctx.data.overview.get()?.meta.fetchedAt;
    when.textContent = at ? `Updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "";
  };
  scope.watch(ctx.data.overview, render);
  scope.interval(render, 30_000);
  return h("div", { class: "topbar-status" }, when, btn);
}

function errorBanner(ctx: AppContext, err: ErrorInfo): HTMLElement {
  const hints: Partial<Record<ErrorInfo["kind"], string>> = {
    config: "The untis CLI is not set up. Check the data source in the settings, or switch to sample data.",
    login: "WebUntis rejected the login. Run `untis init` in a terminal to update your credentials.",
    unreachable: "WebUntis could not be reached. Cached data is shown where available.",
    network: "The local backend is not reachable.",
  };
  return h(
    "div",
    { class: `banner banner-${err.kind === "unreachable" ? "warning" : "error"}` },
    icon("alert"),
    h("div", null, h("strong", null, hints[err.kind] ?? "Something went wrong."), h("div", { class: "small muted" }, err.message)),
    h("div", { class: "spacer" }),
    h("button", { class: "btn", onclick: () => ctx.router.navigate("/settings") }, "Settings"),
    h("button", { class: "btn", onclick: () => void ctx.data.loadOverview(true) }, "Retry"),
  );
}

function toasts(ctx: AppContext, scope: Scope): HTMLElement {
  const box = h("div", { class: "toasts", attrs: { role: "status", "aria-live": "polite" } });
  scope.watch(ctx.toasts.items, (items) =>
    replace(
      box,
      items.map((t) =>
        h(
          "div",
          { class: `toast toast-${t.kind}` },
          h("div", { class: "toast-text" }, h("strong", null, t.title), t.body ? h("div", { class: "small" }, t.body) : null),
          h("button", { class: "icon-btn", onclick: () => ctx.toasts.dismiss(t.id), attrs: { "aria-label": "Dismiss" } }, icon("close", 14)),
        ),
      ),
    ),
  );
  return box;
}
