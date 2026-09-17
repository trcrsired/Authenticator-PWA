// Web implementations of chrome.runtime, chrome.tabs, chrome.windows,
// chrome.scripting, chrome.contextMenus and chrome.commands.

import {
  addMessageListener,
  dispatchMessage,
  hasMessageListener,
  removeMessageListener,
} from "./bus";

// The PWA is served from the origin root.
const ROOT = "/";

function makeEvent<L extends (...args: never[]) => unknown>() {
  const listeners = new Set<L>();
  return {
    addListener: (listener: L) => listeners.add(listener),
    removeListener: (listener: L) => listeners.delete(listener),
    hasListener: (listener: L) => listeners.has(listener),
    _listeners: listeners,
  };
}

const selfTab = {
  id: 0,
  windowId: 0,
  index: 0,
  active: true,
  highlighted: true,
  pinned: false,
  incognito: false,
  selected: true,
  discarded: false,
  autoDiscardable: true,
  get url() {
    return location.href;
  },
  get title() {
    return document.title;
  },
};

export const runtimeShim = {
  id: "authenticator-pwa",
  lastError: undefined,
  getURL(path: string) {
    return path.startsWith("/") ? path : ROOT + path;
  },
  getManifest() {
    return {
      name: "Authenticator",
      short_name: "Authenticator",
      version: "9.0.0",
      manifest_version: 3,
    };
  },
  sendMessage(message: unknown, callback?: (response?: unknown) => void) {
    return dispatchMessage(message, callback);
  },
  onMessage: {
    addListener: addMessageListener,
    removeListener: removeMessageListener,
    hasListener: hasMessageListener,
  },
  // There is no install lifecycle on the web.
  onInstalled: makeEvent(),
  onStartup: makeEvent(),
};

export const tabsShim = {
  TAB_ID_NONE: -1,
  query(queryInfo?: { active?: boolean; windowId?: number }) {
    void queryInfo;
    return Promise.resolve([selfTab]);
  },
  getCurrent() {
    return Promise.resolve(selfTab);
  },
  get(tabId: number) {
    void tabId;
    return Promise.resolve(selfTab);
  },
  create(createProperties: { url: string; active?: boolean }) {
    const win = window.open(createProperties.url, "_blank");
    return Promise.resolve({
      ...selfTab,
      id: 1,
      windowId: 1,
      url: createProperties.url,
      pendingUrl: createProperties.url,
      opener: win,
    });
  },
  sendMessage(
    tabId: number,
    message: unknown,
    callback?: (response?: unknown) => void
  ) {
    void tabId;
    return dispatchMessage(message, callback);
  },
  remove(tabIds: number | number[]) {
    void tabIds;
    window.close();
    return Promise.resolve();
  },
  update(_tabId: number, updateProperties: { url?: string }) {
    if (updateProperties.url) {
      location.href = updateProperties.url;
    }
    return Promise.resolve(selfTab);
  },
  // Screen capture is not supported yet; resolves undefined like a denied
  // capture request.
  captureVisibleTab(
    windowId?: number,
    options?: { format?: string; quality?: number },
    callback?: (dataUrl?: string) => void
  ) {
    void windowId;
    void options;
    if (callback) {
      setTimeout(() => callback(undefined), 0);
    }
    return Promise.resolve(undefined);
  },
};

let windowIdCounter = 1;

export const windowsShim = {
  WINDOW_ID_NONE: -1,
  WINDOW_ID_CURRENT: 0,
  getCurrent() {
    return Promise.resolve({ id: 0, focused: true, type: "normal" });
  },
  get(windowId: number) {
    return Promise.resolve({ id: windowId, focused: true, type: "normal" });
  },
  create(createData: {
    url?: string;
    type?: string;
    height?: number;
    width?: number;
  }) {
    const features =
      `popup=yes` +
      (createData.width ? `,width=${createData.width}` : "") +
      (createData.height ? `,height=${createData.height}` : "");
    const win = window.open(createData.url ?? "about:blank", "_blank", features);
    return Promise.resolve({
      id: windowIdCounter++,
      focused: true,
      type: createData.type ?? "popup",
      tabs: [],
      _window: win,
    });
  },
  update(
    windowId: number,
    updateInfo: { height?: number; width?: number; focused?: boolean }
  ) {
    void windowId;
    if (updateInfo.height || updateInfo.width) {
      try {
        window.resizeTo(
          updateInfo.width ?? window.outerWidth,
          updateInfo.height ?? window.outerHeight
        );
      } catch {
        // resizeTo is a no-op for normal browser tabs
      }
    }
    if (updateInfo.focused) {
      window.focus();
    }
    return Promise.resolve({ id: windowId, focused: true, type: "normal" });
  },
  remove(windowId: number) {
    void windowId;
    window.close();
    return Promise.resolve();
  },
};

export const scriptingShim = {
  // Content scripts don't exist in the PWA — injection is a no-op.
  executeScript(injection: unknown) {
    void injection;
    return Promise.resolve([]);
  },
  insertCSS(injection: unknown) {
    void injection;
    return Promise.resolve([]);
  },
};

export const contextMenusShim = {
  create() {
    return 0;
  },
  removeAll(callback?: () => void) {
    if (callback) {
      setTimeout(callback, 0);
    }
    return Promise.resolve();
  },
  onClicked: makeEvent(),
};

export const commandsShim = {
  onCommand: makeEvent(),
};
