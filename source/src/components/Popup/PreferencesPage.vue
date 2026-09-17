<template>
  <div>
    <a-select-input
      :label="i18n.theme"
      v-model="theme"
      style="margin-left: 10px"
    >
      <option value="auto">{{ i18n.theme_auto }}</option>
      <option value="normal">{{ i18n.theme_light }}</option>
      <option value="dark">{{ i18n.theme_dark }}</option>
      <option value="simple">{{ i18n.theme_simple }}</option>
      <option value="compact">{{ i18n.theme_compact }}</option>
      <option value="accessibility">{{ i18n.theme_high_contrast }}</option>
      <option value="flat">{{ i18n.theme_flat }}</option>
    </a-select-input>
    <a-select-input
      :label="i18n.scale"
      v-model="zoom"
      style="margin-left: 10px"
    >
      <option value="125">125%</option>
      <option value="100">100%</option>
      <option value="90">90%</option>
      <option value="80">80%</option>
      <option value="67">67%</option>
      <option value="57">57%</option>
      <option value="50">50%</option>
      <option value="40">40%</option>
      <option value="33">33%</option>
      <option value="25">25%</option>
      <option value="20">20%</option>
    </a-select-input>
    <a-toggle-input
      :label="i18n.browser_sync"
      v-model="browserSync"
      :disabled="storageArea"
      @change="migrateStorage()"
    />
    <a-toggle-input :label="i18n.smart_filter" v-model="smartFilter" />
    <a-toggle-input
      :label="i18n.require_user_verification"
      v-model="userVerification"
    />
    <a-toggle-input
      :label="i18n.require_unlock_verification"
      v-model="unlockVerification"
    />

    <div class="control-group" v-show="!!defaultEncryption">
      <label class="combo-label">{{ i18n.autolock }}</label>
      <input
        class="input"
        type="number"
        min="0"
        style="width: 70px; text-align: center"
        v-model="autolock"
        :disabled="Boolean(enforceAutolock)"
      />
      <span class="combo-label" style="margin-left: 0; margin-right: 20px">{{
        i18n.minutes
      }}</span>
    </div>
    <a-button @click="popOut()">{{ i18n.popout }}</a-button>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isFirefox } from "../../browser";
import { UserSettings } from "../../models/settings";
import { enrollUserVerification } from "../../models/user-verification";

export default Vue.extend({
  computed: {
    zoom: {
      get(): number {
        return this.$store.state.menu.zoom;
      },
      set(zoom: number) {
        this.$store.commit("menu/setZoom", zoom);
      },
    },
    userVerification: {
      get(): boolean {
        return this.$store.state.menu.useUserVerification;
      },
      async set(enabled: boolean) {
        if (!enabled) {
          this.$store.commit("menu/setUserVerification", false);
          return;
        }
        if (!(await this.ensureCredential())) {
          return;
        }
        this.$store.commit("menu/setUserVerification", true);
      },
    },
    unlockVerification: {
      get(): boolean {
        return this.$store.state.menu.useUnlockVerification;
      },
      async set(enabled: boolean) {
        if (!enabled) {
          this.$store.commit("menu/setUnlockVerification", false);
          return;
        }
        if (!(await this.ensureCredential())) {
          return;
        }
        this.$store.commit("menu/setUnlockVerification", true);
      },
    },
    smartFilter: {
      get(): boolean {
        return this.$store.state.menu.smartFilter;
      },
      set(smartFilter: boolean) {
        this.$store.commit("menu/setSmartFilter", smartFilter);
        this.$store.commit(
          "notification/alert",
          this.i18n.activate_auto_filter
        );
      },
    },
    theme: {
      get(): string {
        return this.$store.state.menu.theme;
      },
      set(theme: string) {
        this.$store.commit("menu/setTheme", theme);
      },
    },
    defaultEncryption(): string {
      return this.$store.state.accounts.defaultEncryption;
    },
    enforceAutolock() {
      return this.$store.state.menu.enforceAutolock;
    },
    autolock: {
      get(): number {
        if (this.$store.state.menu.enforceAutolock) {
          return this.$store.state.menu.enforceAutolock;
        } else {
          return this.$store.state.menu.autolock;
        }
      },
      set(autolock: number) {
        this.$store.commit("menu/setAutolock", autolock);
        chrome.runtime.sendMessage({ action: "resetAutolock" });
      },
    },
    storageArea() {
      return this.$store.state.menu.storageArea;
    },
    browserSync: {
      get(): boolean {
        return this.newStorageLocation === "sync";
      },
      set(value) {
        this.newStorageLocation = value ? "sync" : "local";
      },
    },
  },
  data() {
    return {
      newStorageLocation: "",
    };
  },
  created() {
    UserSettings.updateItems().then(() => {
      this.newStorageLocation =
        this.$store.state.menu.storageArea ||
        UserSettings.items.storageLocation;
    });
  },
  methods: {
    // Reuse the already-enrolled platform credential when present;
    // otherwise run WebAuthn enrollment (biometric/screen lock prompt).
    async ensureCredential(): Promise<boolean> {
      if (UserSettings.items.uvCredentialId) {
        return true;
      }
      const credentialId = await enrollUserVerification();
      if (!credentialId) {
        this.$store.commit(
          "notification/ephermalMessage",
          this.i18n.verification_failed
        );
        return false;
      }
      UserSettings.items.uvCredentialId = credentialId;
      UserSettings.commitItems();
      return true;
    },
    popOut() {
      let windowType;
      if (isFirefox) {
        windowType = "detached_panel";
      } else {
        windowType = "panel";
      }
      chrome.windows.create({
        url: chrome.runtime.getURL("index.html?popup=true"),
        type: windowType as chrome.windows.createTypeEnum,
        height: window.innerHeight,
        width: window.innerWidth,
      });
    },
    migrateStorage() {
      this.$store.commit("currentView/changeView", "LoadingPage");
      this.$store
        .dispatch("accounts/migrateStorage", this.newStorageLocation)
        .then((m) => {
          this.$store.commit("notification/alert", this.i18n[m]);
          this.$store.commit("currentView/changeView", "PreferencesPage");
        }),
        (r: string) => {
          this.$store.commit("notification/alert", this.i18n.updateFailure + r);
          this.$store.commit("currentView/changeView", "PreferencesPage");
        };
    },
  },
});
</script>
