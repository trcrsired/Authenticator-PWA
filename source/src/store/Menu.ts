import { isSafari } from "../browser";
import { UserSettings } from "../models/settings";
import { ManagedStorage } from "../models/storage";

export class Menu implements Module {
  async getModule() {
    await UserSettings.updateItems();

    // Migrate the legacy single-axis theme values: "dark" became a
    // separate darkMode axis so every layout theme can be light or dark.
    let theme = UserSettings.items.theme || (isSafari ? "flat" : "normal");
    let darkMode = UserSettings.items.darkMode;
    if (!darkMode) {
      if (theme === "dark") {
        darkMode = "dark";
      } else {
        darkMode = "auto";
      }
    }
    if (theme === "dark" || theme === "auto") {
      theme = "normal";
    }

    const menuState = {
      state: {
        version: chrome.runtime.getManifest()?.version || "0.0.0",
        zoom: Number(UserSettings.items.zoom) || 100,
        smartFilter: UserSettings.items.smartFilter === true,
        useUserVerification:
          UserSettings.items.requireUserVerification === true,
        useUnlockVerification:
          UserSettings.items.requireUnlockVerification === true,
        // Default on: absent key means pause while hidden.
        pauseInBackground: UserSettings.items.pauseInBackground !== false,
        enableContextMenu: UserSettings.items.enableContextMenu === true,
        theme,
        darkMode,
        browserDark:
          typeof matchMedia === "function" &&
          matchMedia("(prefers-color-scheme: dark)").matches,
        autolock: Number(UserSettings.items.autolock) || 30,
        backupDisabled: await ManagedStorage.get("disableBackup", false),
        exportDisabled: await ManagedStorage.get("disableExport", false),
        enforcePassword: await ManagedStorage.get("enforcePassword", false),
        enforceAutolock: await ManagedStorage.get("enforceAutolock", false),
        storageArea: await ManagedStorage.get<"sync" | "local">("storageArea"),
        feedbackURL: await ManagedStorage.get<string>("feedbackURL"),
        passwordPolicy: await ManagedStorage.get<string>("passwordPolicy"),
        passwordPolicyHint: await ManagedStorage.get<string>(
          "passwordPolicyHint"
        ),
      },
      getters: {
        // Layout theme (normal/simple/compact/flat/accessibility).
        effectiveTheme(state: MenuState) {
          return state.theme;
        },
        // Dark palette axis — "auto" follows the browser's color scheme.
        effectiveDark(state: MenuState & { browserDark: boolean }) {
          return (
            state.theme !== "accessibility" &&
            (state.darkMode === "dark" ||
              (state.darkMode === "auto" && state.browserDark))
          );
        },
      },
      mutations: {
        setBrowserDark(state: { browserDark: boolean }, dark: boolean) {
          state.browserDark = dark;
        },
        setZoom: (state: MenuState, zoom: number) => {
          state.zoom = zoom;
          UserSettings.items.zoom = zoom;
          UserSettings.commitItems();
          this.resize(zoom);
        },
        setSmartFilter(state: MenuState, smartFilter: boolean) {
          state.smartFilter = smartFilter;
          UserSettings.items.smartFilter = smartFilter;
          UserSettings.commitItems();
        },
        // The two verification toggles share one enrolled platform
        // credential (uvCredentialId); it is only cleared when both are off.
        setUserVerification(state: MenuState, enabled: boolean) {
          state.useUserVerification = enabled;
          UserSettings.items.requireUserVerification = enabled;
          if (!enabled && !UserSettings.items.requireUnlockVerification) {
            delete UserSettings.items.uvCredentialId;
          }
          UserSettings.commitItems();
        },
        setUnlockVerification(state: MenuState, enabled: boolean) {
          state.useUnlockVerification = enabled;
          UserSettings.items.requireUnlockVerification = enabled;
          if (!enabled && !UserSettings.items.requireUserVerification) {
            delete UserSettings.items.uvCredentialId;
          }
          UserSettings.commitItems();
        },
        setPauseInBackground(state: MenuState, enabled: boolean) {
          state.pauseInBackground = enabled;
          UserSettings.items.pauseInBackground = enabled;
          UserSettings.commitItems();
        },
        setEnableContextMenu(state: MenuState, enableContextMenu: boolean) {
          state.enableContextMenu = enableContextMenu;
          UserSettings.items.enableContextMenu = enableContextMenu;
          UserSettings.commitItems();
        },
        setTheme(state: MenuState, theme: string) {
          state.theme = theme;
          UserSettings.items.theme = theme;
          UserSettings.commitItems();
        },
        setDarkMode(state: MenuState, darkMode: string) {
          state.darkMode = darkMode;
          UserSettings.items.darkMode = darkMode;
          UserSettings.commitItems();
        },
        setAutolock(state: MenuState, autolock: number) {
          state.autolock = autolock;
          UserSettings.items.autolock = autolock;
          UserSettings.commitItems();
        },
      },
      namespaced: true,
    };

    this.resize(menuState.state.zoom);

    return menuState;
  }

  private resize(zoom: number) {
    if (zoom !== 100) {
      document.body.style.marginBottom = 480 * (zoom / 100 - 1) + "px";
      document.body.style.marginRight = 320 * (zoom / 100 - 1) + "px";
      document.body.style.transform = "scale(" + zoom / 100 + ")";
    }
  }
}
