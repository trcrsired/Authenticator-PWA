<template>
  <div class="qrscan">
    <video ref="video" playsinline muted autoplay></video>
    <p v-if="error" class="error_password">{{ error }}</p>
    <a-button v-if="error" @click="openFileImport()">
      {{ i18n.import_backup_qr }}
    </a-button>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import jsQR from "jsqr";
import { getEntryDataFromOTPAuthPerLine } from "../../models/import-backup";
import { EntryStorage } from "../../models/storage";
import { Encryption } from "../../models/encryption";
import { maybeOfferUnlockSetup } from "../../models/user-verification";

export default Vue.extend({
  data() {
    return {
      error: "",
      stream: null as MediaStream | null,
      scanTimer: 0,
    };
  },
  async mounted() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch (e) {
      console.error(e);
      this.error = this.i18n.capture_failed;
      return;
    }
    const video = this.$refs.video as HTMLVideoElement;
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
    this.scanTimer = window.setInterval(() => this.scanFrame(video), 250);
  },
  beforeDestroy() {
    window.clearInterval(this.scanTimer);
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
  },
  methods: {
    scanFrame(video: HTMLVideoElement) {
      if (!video.videoWidth || !video.videoHeight) {
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (
        code &&
        (code.data.startsWith("otpauth://") ||
          code.data.startsWith("otpauth-migration:"))
      ) {
        window.clearInterval(this.scanTimer);
        this.importOtpUrl(code.data);
      }
    },
    async importOtpUrl(otpUrl: string) {
      const result = await getEntryDataFromOTPAuthPerLine(otpUrl);
      if (Object.keys(result.exportData).length) {
        const encryption =
          this.$store.state.accounts.encryption.get(
            this.$store.state.accounts.defaultEncryption
          ) ?? new Encryption("", "");
        await EntryStorage.import(encryption, result.exportData);
        await this.$store.dispatch("accounts/updateEntries");
        this.$store.commit(
          "notification/ephermalMessage",
          this.i18n.updateSuccess
        );
        this.$store.commit("style/hideInfo");
        maybeOfferUnlockSetup((enabled) =>
          this.$store.commit("menu/setUnlockVerification", enabled)
        );
      } else {
        this.error = this.i18n.errorqr;
      }
    },
    openFileImport() {
      this.$store.commit("currentView/changeView", {
        view: "ImportPage",
        param: "QrImport",
      });
    },
  },
});
</script>
