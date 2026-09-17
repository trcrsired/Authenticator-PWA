<template>
  <div>
    <a-button @click="beginCapture()">{{ i18n.add_qr }}</a-button>
    <a-button @click="showInfo('AddAccountPage')">
      {{ i18n.add_secret }}
    </a-button>
    <a-button @click="showInfo('ImportPage', 'QrImport')">{{
      i18n.import_qr_images
    }}</a-button>
    <a-button @click="showInfo('ImportPage', 'TextImport')">{{
      i18n.import_otp_urls
    }}</a-button>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
export default Vue.extend({
  methods: {
    showInfo(page: string, param = "") {
      if (this.$store.getters["accounts/currentlyEncrypted"]) {
        this.$store.commit("notification/alert", this.i18n.phrase_incorrect);
        return;
      }
      this.$store.commit("style/showInfo");
      this.$store.commit("currentView/changeView", { view: page, param });
    },
    async beginCapture() {
      // No screen capture in the PWA yet — use image file import.
      this.showInfo("ImportPage", "QrImport");
    },
  },
});
</script>
