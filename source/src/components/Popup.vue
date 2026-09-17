<template>
  <div
    v-cloak
    v-bind:class="[themeClasses, { hideoutline }]"
    v-on:mousedown="hideoutline = true"
    v-on:keydown="hideoutline = false"
  >
    <MainHeader />
    <MainBody
      v-bind:class="{
        timeout: style.timeout && !style.isEditing,
        edit: style.isEditing,
      }"
    />

    <MenuPage
      id="menu"
      v-show="style.slidein || style.slideout"
      v-bind:class="{ slidein: style.slidein, slideout: style.slideout }"
    />

    <PageHandler
      v-bind:class="{
        fadein: style.fadein,
        fadeout: style.fadeout,
        show: style.show,
      }"
    />

    <NotificationHandler />

    <!-- EPHERMAL MESSAGE -->
    <div
      id="notification"
      v-bind:class="{
        fadein: style.notificationFadein,
        fadeout: style.notificationFadeout,
      }"
    >
      {{ notification }}
    </div>

    <!-- QR -->
    <div
      id="qr"
      v-bind:class="{ qrfadein: style.qrfadein, qrfadeout: style.qrfadeout }"
      v-bind:style="{ 'background-image': qr }"
      v-on:click="hideQr()"
    ></div>

    <!-- CLIPBOARD -->
    <input type="text" id="codeClipboard" tabindex="-1" />

    <!-- APP LOCK (WebAuthn gate) — blank cover while locked; the system
         prompt fires automatically. The "tap to unlock" hint appears
         only when verification actually failed, offering a retry. -->
    <div id="appLock" v-if="style.appLocked" v-on:click="unlockApp()">
      <p v-if="style.unlockFailed">{{ i18n.tap_to_unlock }}</p>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState, mapGetters } from "vuex";

import MainHeader from "./Popup/MainHeader.vue";
import MainBody from "./Popup/MainBody.vue";
import MenuPage from "./Popup/MenuPage.vue";
import PageHandler from "./Popup/PageHandler.vue";
import NotificationHandler from "./Popup/NotificationHandler.vue";
import {
  verifyUser,
  cancelStartupVerification,
} from "../models/user-verification";
import { UserSettings } from "../models/settings";

const computedPrototype = [
  mapState("style", ["style"]),
  mapGetters("menu", { theme: "effectiveTheme" }),
  mapState("qr", ["qr"]),
  mapState("notification", ["notification"]),
];

let computed = {};

for (const module of computedPrototype) {
  Object.assign(computed, module);
}

// Page background per theme (the "white-1" sass value) — drives the
// OS title bar / status bar color via <meta name="theme-color">.
const THEME_COLORS: { [theme: string]: string } = {
  accessibility: "#000000",
};

export default Vue.extend({
  data: function () {
    return {
      hideoutline: true,
      unlocking: false,
    };
  },
  computed: {
    ...computed,
    // Layout theme class plus the dark palette modifier — every theme
    // has a light and a dark variant.
    themeClasses(): string[] {
      const theme = this.$store.getters["menu/effectiveTheme"];
      const classes = [`theme-${theme}`];
      if (this.$store.getters["menu/effectiveDark"]) {
        classes.push("theme-dark");
      }
      return classes;
    },
    titleBarColor(): string {
      const theme = this.$store.getters["menu/effectiveTheme"];
      if (THEME_COLORS[theme]) {
        return THEME_COLORS[theme];
      }
      return this.$store.getters["menu/effectiveDark"]
        ? "#242424"
        : "#ffffff";
    },
  },
  watch: {
    titleBarColor: {
      immediate: true,
      handler(color: string) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
          meta.setAttribute("content", color);
        }
      },
    },
  },
  methods: {
    hideQr() {
      this.$store.commit("style/hideQr");
    },
    async unlockApp() {
      if (this.unlocking) {
        return;
      }
      // A gestureless startup prompt may still be pending (Android only
      // allows one WebAuthn request) — abort it so this tap-backed call
      // can proceed.
      cancelStartupVerification();
      const credentialId = UserSettings.items.uvCredentialId;
      if (!credentialId) {
        this.$store.commit("style/setAppLocked", false);
        return;
      }
      this.unlocking = true;
      try {
        const ok = await verifyUser(credentialId);
        if (ok) {
          this.$store.commit("style/setAppLocked", false);
        } else {
          this.$store.commit("style/setUnlockFailed", true);
          this.$store.commit(
            "notification/alert",
            this.i18n.verification_failed
          );
        }
      } finally {
        this.unlocking = false;
      }
    },
  },
  components: {
    MainHeader,
    MainBody,
    MenuPage,
    PageHandler,
    NotificationHandler,
  },
});
</script>
