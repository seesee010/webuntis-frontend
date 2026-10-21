import { registerDictionary } from "@/core/i18n";
import { de } from "./de";

/** Registers all bundled translations. English needs none. */
export function registerTranslations(): void {
  registerDictionary("de", de);
}
