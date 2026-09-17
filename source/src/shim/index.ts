// Installs a `chrome` global backed by web platform APIs so that code ported
// from the browser extension keeps working. Must be imported before anything
// that touches `chrome.*` — entries should have `import "./shim"` as their
// first import.

import { storageShim } from "./storage";
import { i18nShim, initI18n } from "./i18n";
import { alarmsShim } from "./alarms";
import { permissionsShim } from "./permissions";
import {
  runtimeShim,
  tabsShim,
  windowsShim,
  scriptingShim,
  contextMenusShim,
  commandsShim,
} from "./runtime";

const chromeShim = {
  storage: storageShim,
  i18n: i18nShim,
  alarms: alarmsShim,
  permissions: permissionsShim,
  runtime: runtimeShim,
  tabs: tabsShim,
  windows: windowsShim,
  scripting: scriptingShim,
  contextMenus: contextMenusShim,
  commands: commandsShim,
};

(globalThis as Record<string, unknown>).chrome = chromeShim;

export { initI18n };
