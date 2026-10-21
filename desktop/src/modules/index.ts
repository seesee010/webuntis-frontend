import type { ModuleDef } from "@/core/module";
import absences from "./absences";
import appearance from "./appearance";
import dashboard from "./dashboard";
import datasource from "./datasource";
import exams from "./exams";
import general from "./general";
import locale from "./locale";
import keyboard from "./keyboard";
import notifications from "./notifications";
import holidays from "./holidays";
import homework from "./homework";
import messages from "./messages";
import settings from "./settings";
import status from "./status";
import subjects from "./subjects";
import timetable from "./timetable";

/** Every feature of the app. Order in the UI comes from ModuleDef.order. */
export const modules: ModuleDef[] = [general, locale, datasource, appearance, subjects, dashboard, timetable, exams, homework, absences, messages, holidays, settings, keyboard, notifications, status];
