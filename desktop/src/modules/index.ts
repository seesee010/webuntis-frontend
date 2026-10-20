import type { ModuleDef } from "@/core/module";
import status from "./status";

/** Every feature of the app. Order in the UI comes from ModuleDef.order. */
export const modules: ModuleDef[] = [status];
