import enMessages from "../../_locales/en/messages.json";
import { initI18n } from "../shim/i18n";
import { UserSettings } from "../models/settings";

export async function loadI18nMessages() {
  // Entries pages (import/options) reach here without having loaded
  // settings — populate items so a saved language preference applies.
  await UserSettings.updateItems();
  await initI18n(UserSettings.items.language);
  const i18nData: { [key: string]: string } = {};
  for (const key of Object.keys(enMessages)) {
    i18nData[key] = chrome.i18n.getMessage(key);
  }
  return i18nData;
}
