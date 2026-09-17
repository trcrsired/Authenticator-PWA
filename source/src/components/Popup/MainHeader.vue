<template>
  <div class="header">
    <span v-on:dblclick="popOut()">{{ i18n.extName }}</span>
    <div v-show="!isPopup()">
      <div
        class="icon"
        id="i-menu"
        v-bind:title="i18n.settings"
        v-on:click="showMenu()"
        v-show="!style.isEditing"
      >
        <IconCog />
      </div>
      <div
        class="icon"
        id="i-plus"
        v-bind:title="i18n.add_code"
        v-on:click="showInfo('AddMethodPage')"
        v-show="style.isEditing"
      >
        <IconPlus />
      </div>
      <div
        class="icon"
        id="i-lock"
        v-bind:title="i18n.lock"
        v-on:click="lock()"
        v-show="!style.isEditing && !!defaultEncryption"
      >
        <IconLock />
      </div>
      <div
        class="icon"
        id="i-qr"
        v-bind:title="i18n.add_qr"
        v-show="!style.isEditing"
        v-on:click="beginCapture()"
      >
        <IconScan />
      </div>
      <div
        class="icon"
        id="i-edit"
        v-bind:title="i18n.edit"
        v-if="!style.isEditing"
        v-on:click="editEntry()"
      >
        <IconPencil />
      </div>
      <div
        class="icon"
        id="i-edit"
        v-bind:title="i18n.edit"
        v-else
        v-on:click="editEntry()"
      >
        <IconCheck />
      </div>
    </div>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { mapState } from "vuex";

// Icons
import IconCog from "../../../svg/cog.svg";
import IconLock from "../../../svg/lock.svg";
import IconScan from "../../../svg/scan.svg";
import IconPencil from "../../../svg/pencil.svg";
import IconCheck from "../../../svg/check.svg";
import IconPlus from "../../../svg/plus.svg";

const computedPrototype = [
  mapState("style", ["style"]),
  mapState("accounts", ["defaultEncryption"]),
];

let computed = {};

for (const module of computedPrototype) {
  Object.assign(computed, module);
}

export default Vue.extend({
  computed,
  methods: {
    isPopup() {
      const params = new URLSearchParams(document.location.search.substring(1));
      return params.get("popup");
    },
    popOut() {
      chrome.windows.create({
        url: chrome.runtime.getURL("index.html?popup=true"),
        type: "popup" as chrome.windows.createTypeEnum,
        height: window.innerHeight,
        width: window.innerWidth,
      });
      window.close();
    },
    showMenu() {
      this.$store.commit("style/showMenu");
    },
    showInfo(page: string, param = "") {
      if (page === "AddMethodPage") {
        if (
          this.$store.state.menu.enforcePassword &&
          !this.$store.state.accounts.defaultEncryption
        ) {
          page = "SetPasswordPage";
        }
      }
      this.$store.commit("style/showInfo");
      this.$store.commit("currentView/changeView", { view: page, param });
    },
    editEntry() {
      this.$store.commit("style/toggleEdit");
      this.$store.commit("accounts/stopFilter");
    },
    lock() {
      chrome.runtime.sendMessage({ action: "lock" }, window.close);
      return;
    },
    async beginCapture() {
      if (
        this.$store.state.menu.enforcePassword &&
        !this.$store.state.accounts.defaultEncryption
      ) {
        this.$store.commit("style/showInfo");
        this.$store.commit("currentView/changeView", "SetPasswordPage");
        return;
      }

      if (this.$store.getters["accounts/currentlyEncrypted"]) {
        this.$store.commit("notification/alert", this.i18n.phrase_incorrect);
        return;
      }

      // No screen capture in the PWA yet — use image file import.
      this.showInfo("ImportPage", "QrImport");
    },
  },
  components: {
    IconCog,
    IconLock,
    IconScan,
    IconPencil,
    IconCheck,
    IconPlus,
  },
});
</script>
