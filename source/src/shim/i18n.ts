// Web implementation of chrome.i18n backed by the extension's _locales
// directory. English messages are bundled so getMessage() is synchronous;
// the user's locale is fetched at startup via initI18n().

import enMessages from "../../_locales/en/messages.json";

interface I18nEntry {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
}

type Catalog = Record<string, I18nEntry>;

// Base catalog is always English; more specific locales override it.
let catalog: Catalog = enMessages as unknown as Catalog;

// Locales shipped in _locales/ — keep in sync with that directory.
export const SUPPORTED_LOCALES = [
  "ar", "bg", "bn", "ca", "cs", "da", "de", "el", "en", "es", "et", "fa",
  "fi", "fr", "fy", "he", "hi", "hr", "hu", "hy", "id", "it", "ja", "ka",
  "kaa", "ko", "lt", "lv", "nl", "no", "pl", "pt", "pt_BR", "ro", "ru",
  "sq", "sr", "sv", "th", "tr", "uk", "vi", "zh_CN", "zh_TW",
];

function normalizeLocale(lang: string) {
  return lang.replace("-", "_");
}

function localeCandidates(preferred?: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (locale: string | undefined) => {
    if (!locale) {
      return;
    }
    const normalized = normalizeLocale(locale);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
    const languageOnly = normalized.split("_")[0];
    if (languageOnly && !seen.has(languageOnly)) {
      seen.add(languageOnly);
      candidates.push(languageOnly);
    }
  };
  // An explicit in-app language choice wins over the browser's list —
  // and suppresses it entirely, so picking "English" on a Chinese
  // browser doesn't merge zh over the en base catalog.
  if (preferred && preferred !== "auto") {
    push(preferred);
    push("en");
    return candidates;
  }
  for (const lang of navigator.languages ?? []) {
    push(lang);
  }
  push(navigator.language);
  push("en");
  return candidates;
}

async function fetchMessages(locale: string): Promise<Catalog | null> {
  try {
    const res = await fetch(
      `/_locales/${encodeURIComponent(locale)}/messages.json`
    );
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as Catalog;
  } catch {
    return null;
  }
}

export async function initI18n(preferred?: string): Promise<void> {
  const candidates = localeCandidates(preferred);
  // Least-specific first so more specific locales override.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const locale = candidates[i];
    if (locale === "en") {
      continue;
    }
    const messages = await fetchMessages(locale);
    if (messages) {
      catalog = { ...catalog, ...messages };
    }
  }
}

function getMessage(
  name: string,
  substitutions?: string | string[]
): string {
  const entry = catalog[name];
  if (!entry) {
    return "";
  }
  const subs = Array.isArray(substitutions)
    ? substitutions
    : substitutions !== undefined
    ? [substitutions]
    : [];

  let message = entry.message;
  const escaped = "\x00";

  // Chrome replaces $$ with a literal $.
  message = message.split("$$").join(escaped);

  // Named placeholders ($name$) whose content references $1..$9.
  if (entry.placeholders) {
    for (const phName of Object.keys(entry.placeholders)) {
      const content = entry.placeholders[phName].content;
      const resolved = content.replace(/\$([1-9])/g, (_, n) => {
        return subs[Number(n) - 1] ?? "";
      });
      message = message.replace(
        new RegExp("\\$" + phName + "\\$", "gi"),
        resolved
      );
    }
  }

  // Direct $1..$9 substitution.
  message = message.replace(/\$([1-9])/g, (_, n) => subs[Number(n) - 1] ?? "");

  return message.split(escaped).join("$");
}

export const i18nShim = {
  getMessage,
  getUILanguage: () => normalizeLocale(navigator.language),
  getAcceptLanguages: (callback?: (languages: string[]) => void) => {
    const langs = [...(navigator.languages ?? [navigator.language])];
    if (callback) {
      callback(langs);
    }
    return Promise.resolve(langs);
  },
};
