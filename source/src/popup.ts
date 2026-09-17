// Web platform shim for the chrome.* APIs used below. Must be first.
import "./shim";
// Registers the in-page handlers that lived in the extension's
// background service worker.
import "./background-web";

// Vue
import Vue from "vue";
import Vuex from "vuex";
import { Vue2Dragula } from "vue2-dragula";

// Components
import Popup from "./components/Popup.vue";
import CommonComponents from "./components/common/index";

// Other
import { loadI18nMessages } from "./store/i18n";
import { Style } from "./store/Style";
import { Accounts } from "./store/Accounts";
import { CurrentView } from "./store/CurrentView";
import { Menu } from "./store/Menu";
import { Notification } from "./store/Notification";
import { Qr } from "./store/Qr";
import { Advisor } from "./store/Advisor";
import { UserSettings } from "./models/settings";
import { initOtpWasm } from "./models/wasm-otp";

async function init() {
  // Crypto falls back to the JS implementation if the wasm fetch fails
  // (e.g. a dev server that doesn't serve /wasm).
  try {
    await initOtpWasm();
  } catch (e) {
    console.warn("OTP wasm module unavailable, using JS crypto fallback", e);
  }
  await UserSettings.updateItems();

  // Add globals
  Vue.prototype.i18n = await loadI18nMessages();

  // Load modules
  Vue.use(Vuex);
  Vue.use(Vue2Dragula);

  // Load common components globally
  for (const component of CommonComponents) {
    Vue.component(component.name, component.component);
  }

  // State
  const store = new Vuex.Store({
    modules: {
      accounts: await new Accounts().getModule(),
      advisor: await new Advisor().getModule(),
      currentView: new CurrentView().getModule(),
      menu: await new Menu().getModule(),
      notification: new Notification().getModule(),
      qr: new Qr().getModule(),
      style: new Style().getModule(),
    },
  });

  // Track the browser's color scheme so the "auto" theme follows it live.
  if (typeof matchMedia === "function") {
    const darkMedia = matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = (event: MediaQueryListEvent) =>
      store.commit("menu/setBrowserDark", event.matches);
    if (typeof darkMedia.addEventListener === "function") {
      darkMedia.addEventListener("change", onSchemeChange);
    } else if (typeof darkMedia.addListener === "function") {
      darkMedia.addListener(onSchemeChange);
    }
  }

  // Render
  const instance = new Vue({
    render: (h) => h(Popup),
    store,
    mounted() {
      // Update time based entries' codes
      this.$store.commit("accounts/updateCodes");
      setInterval(() => {
        this.$store.commit("accounts/updateCodes");
      }, 1000);
    },
  }).$mount("#authenticator");

  // Prompt for password if needed
  if (instance.$store.state.accounts.shouldShowPassphrase) {
    // If we have cached password, use that
    if (instance.$store.state.accounts.defaultEncryption) {
      instance.$store.commit("currentView/changeView", "LoadingPage");
      await instance.$store.dispatch("accounts/updateEntries");
    } else {
      instance.$store.commit("style/showInfo", true);
      instance.$store.commit("currentView/changeView", "EnterPasswordPage");
    }
  } else {
    // Set init complete if no encryption is present, otherwise this will be set in updateEntries.
    instance.$store.commit("accounts/initComplete");
  }

  // Auto focus on first entry
  document.querySelector<HTMLAnchorElement>("a.entry[tabindex='0']")?.focus();

  // Set document title
  try {
    document.title = instance.i18n.extName;
  } catch (e) {
    console.error(e);
  }

  // Warn if legacy password is set
  if (UserSettings.items.encodedPhrase) {
    instance.$store.commit(
      "notification/alert",
      instance.i18n.local_passphrase_warning
    );
  }

  // Backup reminder / run backup
  const backupReminder = setInterval(() => {
    if (instance.$store.state.accounts.entries.length === 0) {
      return;
    }

    if (instance.$store.getters["accounts/currentlyEncrypted"]) {
      return;
    }

    clearInterval(backupReminder);

    const clientTime = Math.floor(new Date().getTime() / 1000 / 3600 / 24);
    if (!UserSettings.items.lastRemindingBackupTime) {
      UserSettings.items.lastRemindingBackupTime = clientTime;
      UserSettings.commitItems();
    } else if (
      clientTime - Number(UserSettings.items.lastRemindingBackupTime) >= 30 ||
      clientTime - Number(UserSettings.items.lastRemindingBackupTime) < 0
    ) {
      instance.$store.commit("notification/alert", instance.i18n.remind_backup);
      UserSettings.items.lastRemindingBackupTime = clientTime;
      UserSettings.commitItems();
    }
    return;
  }, 5000);

  // Open search if '/' is pressed
  document.addEventListener(
    "keyup",
    (e) => {
      if (e.key === "/") {
        if (instance.$store.getters["style/isMenuShown"]) {
          return;
        }
        instance.$store.commit("accounts/stopFilter");
        // It won't focus the texfield if vue unhides the div
        instance.$store.commit("accounts/showSearch");
        const searchDiv = document.getElementById("search");
        const searchInput = document.getElementById("searchInput");
        if (!searchInput || !searchDiv) {
          return;
        }
        searchDiv.style.display = "block";
        searchInput.focus();
      }
    },
    false
  );

  // Show search box if more than 10 entries
  if (
    instance.$store.state.accounts.entries.length >= 10 &&
    !(
      instance.$store.getters["accounts/shouldFilter"] &&
      instance.$store.state.accounts.filter
    )
  ) {
    instance.$store.commit("accounts/showSearch");
  }

  const query = new URLSearchParams(document.location.search.substring(1));
  // Resize window to proper size if popup
  if (query.get("popup")) {
    const zoom = Number(UserSettings.items.zoom) / 100 || 1;
    const correctHeight = 480 * zoom;
    const correctWidth = 320 * zoom;
    if (
      window.innerHeight !== correctHeight ||
      window.innerWidth !== correctWidth
    ) {
      // window update to correct size
      const adjustedHeight =
        correctHeight + (window.outerHeight - window.innerHeight);
      const adjustedWidth =
        correctWidth + (window.outerWidth - window.innerWidth);
      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, {
        height: adjustedHeight,
        width: adjustedWidth,
      });
    }
  }
}

init();
