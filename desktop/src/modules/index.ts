import type { ModuleDef } from "@/core/module";
import appearance from "./appearance";
import datasource from "./datasource";
import general from "./general";
import settings from "./settings";
import status from "./status";

/** Every feature of the app. Order in the UI comes from ModuleDef.order. */
export const modules: ModuleDef[] = [general, datasource, appearance, settings, status];
