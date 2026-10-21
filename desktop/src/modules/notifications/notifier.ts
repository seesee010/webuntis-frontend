/** Sends desktop notifications through Tauri, the web Notification API,
 * or nowhere. Chosen once at runtime. */
export interface Notifier {
  name: "tauri" | "web" | "none";
  permitted(): Promise<boolean>;
  request(): Promise<boolean>;
  send(title: string, body: string): Promise<void>;
}

export async function createNotifier(): Promise<Notifier> {
  if ("__TAURI_INTERNALS__" in window) {
    const n = await import("@tauri-apps/plugin-notification");
    return {
      name: "tauri",
      permitted: () => n.isPermissionGranted(),
      request: async () => (await n.requestPermission()) === "granted",
      send: async (title, body) => n.sendNotification({ title, body }),
    };
  }
  if (typeof Notification !== "undefined") {
    return {
      name: "web",
      permitted: async () => Notification.permission === "granted",
      request: async () => (await Notification.requestPermission()) === "granted",
      send: async (title, body) => void new Notification(title, { body }),
    };
  }
  return { name: "none", permitted: async () => false, request: async () => false, send: async () => {} };
}
