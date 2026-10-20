import type { ModuleDef } from "@/core/module";
import appearance from "./appearance";
import dashboard from "./dashboard";
import datasource from "./datasource";
import general from "./general";
import settings from "./settings";
import status from "./status";
import timetable from "./timetable";

/** Every feature of the app. Order in the UI comes from ModuleDef.order. */
export const modules: ModuleDef[] = [general, datasource, appearance, dashboard, timetable, settings, status];
