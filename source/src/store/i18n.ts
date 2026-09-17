import enMessages from "../../_locales/en/messages.json";
import { initI18n } from "../shim/i18n";

export async function loadI18nMessages() {
  await initI18n();
  const i18nData: { [key: string]: string } = {};
  for (const key of Object.keys(enMessages)) {
    i18nData[key] = chrome.i18n.getMessage(key);
  }
  return i18nData;
}
