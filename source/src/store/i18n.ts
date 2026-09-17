import enMessages from "../../_locales/en/messages.json";
import { initI18n } from "../shim/i18n";
import { UserSettings } from "../models/settings";

export async function loadI18nMessages() {
  await initI18n(UserSettings.items.language);
  const i18nData: { [key: string]: string } = {};
  for (const key of Object.keys(enMessages)) {
    i18nData[key] = chrome.i18n.getMessage(key);
  }
  return i18nData;
}
