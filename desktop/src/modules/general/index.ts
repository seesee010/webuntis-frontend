import { defineModule } from "@/core/module";

/** App-wide behaviour that belongs to no particular view. */
export default defineModule({
  id: "general",
  title: "General",
  icon: "settings",
  settings: [
    {
      id: "general",
      title: "General",
      icon: "settings",
      order: 0,
      fields: [
        {
          key: "ui.startPage",
          type: "select",
          label: "Start page",
          description: "The view that opens when the app starts.",
          default: "/dashboard",
          options: (ctx) =>
            ctx.modules
              .all()
              .filter((m) => m.route && m.route.nav !== false)
              .map((m) => ({ value: m.route!.path, label: m.title })),
        },
        {
          key: "ui.sidebarCollapsed",
          type: "toggle",
          label: "Collapse the sidebar",
          description: "Show only icons in the navigation.",
          default: false,
        },
        {
          key: "ui.rememberLastPage",
          type: "toggle",
          label: "Reopen the last page",
          description: "Start where you left off instead of on the start page.",
          default: false,
        },
        {
          key: "ui.lastPage",
          type: "text",
          label: "Last page",
          default: "",
          visibleIf: () => false, // internal; stored here so it resets with everything else
        },
      ],
    },
  ],
  setup(ctx) {
    if (location.hash.replace(/^#\/?/, "")) return;
    const target = ctx.settings.get<boolean>("ui.rememberLastPage") && ctx.settings.get<string>("ui.lastPage");
    ctx.router.navigate(target || ctx.settings.get<string>("ui.startPage"));
    return ctx.router.route.subscribe((r) => {
      if (ctx.settings.get("ui.rememberLastPage")) ctx.settings.set("ui.lastPage", r.path);
    }, false);
  },
});
