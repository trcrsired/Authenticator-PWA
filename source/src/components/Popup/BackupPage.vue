<template>
  <div>
    <!-- File Backup -->
    <div v-show="!exportDisabled">
      <div class="text warning" v-if="!defaultEncryption">
        {{ i18n.export_info }}
      </div>
      <div class="text">
        {{ i18n.backup_file_info }}
      </div>
      <div class="text warning" v-if="unsupportedAccounts">
        {{ i18n.otp_unsupported_warn }}
      </div>
      <div class="text warning" v-if="currentlyEncrypted">
        {{ i18n.phrase_incorrect_export }}
      </div>
      <a-button-link
        download="authenticator.txt"
        :href="exportOneLineOtpAuthFile"
        v-if="!unsupportedAccounts && isDataLinkSupported"
        @click="onExportClick($event, exportOneLineOtpAuthFile, 'authenticator.txt')"
        >{{ i18n.download_backup }}</a-button-link
      >
      <button
        v-on:click="downloadBackUpOneLineOtpAuthFile()"
        v-if="!unsupportedAccounts && !isDataLinkSupported"
        class="button"
      >
        {{ i18n.download_backup }}
      </button>
      <a-button-link
        download="authenticator.json"
        :href="exportFile"
        v-if="unsupportedAccounts && isDataLinkSupported"
        @click="onExportClick($event, exportFile, 'authenticator.json')"
        >{{ i18n.download_backup }}</a-button-link
      >
      <button
        v-on:click="downloadBackUpExportFile()"
        v-if="unsupportedAccounts && !isDataLinkSupported"
        class="button"
      >
        {{ i18n.download_backup }}
      </button>
      <a-button-link
        download="authenticator.json"
        :href="exportEncryptedFile"
        v-if="!!defaultEncryption && isDataLinkSupported"
        @click="onExportClick($event, exportEncryptedFile, 'authenticator.json')"
        >{{ i18n.download_enc_backup }}</a-button-link
      >
      <button
        v-on:click="downloadBackUpExportEncryptedFile()"
        v-if="!!defaultEncryption && !isDataLinkSupported"
        class="button"
      >
        {{ i18n.download_enc_backup }}
      </button>
      <a-button @click="exportQr()">{{ i18n.export_qr }}</a-button>
      <div class="exportQr" v-if="exportQrs.length">
        <div class="text">{{ i18n.export_qr_info }}</div>
        <div v-for="(qr, i) in exportQrs" v-bind:key="i">
          <img v-bind:src="qr" alt="QR" />
          <div class="text" v-if="exportQrs.length > 1">
            {{ i + 1 }} / {{ exportQrs.length }}
          </div>
        </div>
      </div>
    </div>
    <a-button @click="showImport()">{{ i18n.import_backup }}</a-button>
  </div>
</template>
<script lang="ts">
import Vue from "vue";
import { isSafari } from "../../browser";
import { UserSettings } from "../../models/settings";
import { verifyUser } from "../../models/user-verification";
import { getOTPAuthMigrationUrisFromEntries } from "../../models/migration";
import * as QRGen from "qrcode-generator";

export default Vue.extend({
  data: function () {
    const exportData = this.$store.state.accounts.exportData;
    const exportEncData = this.$store.state.accounts.exportEncData;
    const key = this.$store.state.accounts.key;

    return {
      unsupportedAccounts: hasUnsupportedAccounts(exportData),
      exportFile: getBackupFile(exportData),
      exportEncryptedFile: getBackupFile(exportEncData, key),
      exportOneLineOtpAuthFile: getOneLineOtpBackupFile(exportData),
      exportQrs: [] as string[],
    };
  },
  computed: {
    defaultEncryption: function () {
      return this.$store.state.accounts.defaultEncryption;
    },
    exportDisabled: function () {
      return this.$store.state.menu.exportDisabled;
    },
    currentlyEncrypted: function () {
      return this.$store.getters["accounts/currentlyEncrypted"];
    },
    backupDisabled: function () {
      return this.$store.state.menu.backupDisabled;
    },
    isDataLinkSupported: function () {
      return !isSafari;
    },
  },
  methods: {
    showImport() {
      this.$store.commit("currentView/changeView", "ImportPage");
    },
    // Gate exports behind platform user verification (biometric/screen
    // lock) when enabled. When verification is off, the anchor's native
    // download proceeds untouched.
    async onExportClick(event: MouseEvent, url: string, filename: string) {
      if (!this.$store.state.menu.useUserVerification) {
        return;
      }
      event.preventDefault();
      if (!(await this.verifyBeforeExport())) {
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
    async verifyBeforeExport(): Promise<boolean> {
      const credentialId = UserSettings.items.uvCredentialId;
      if (
        !this.$store.state.menu.useUserVerification ||
        !credentialId
      ) {
        return true;
      }
      const ok = await verifyUser(credentialId);
      if (!ok) {
        this.$store.commit(
          "notification/ephermalMessage",
          this.i18n.verification_failed
        );
      }
      return ok;
    },
    async downloadBackUpOneLineOtpAuthFile() {
      if (!(await this.verifyBeforeExport())) {
        return;
      }
      const exportData = this.$store.state.accounts.exportData;
      const t = getOneLineOtpBackupFile(exportData);
      window.open(t);
    },
    async downloadBackUpExportFile() {
      if (!(await this.verifyBeforeExport())) {
        return;
      }
      const exportData = this.$store.state.accounts.exportData;
      const t = getBackupFile(exportData);
      window.open(t);
    },
    async exportQr() {
      if (!(await this.verifyBeforeExport())) {
        return;
      }
      const uris = getOTPAuthMigrationUrisFromEntries(
        this.$store.state.accounts.entries
      );
      const urls: string[] = [];
      try {
        for (const uri of uris) {
          const qr = QRGen(0, "L");
          qr.addData(uri);
          qr.make();
          urls.push(qr.createDataURL(5));
        }
      } catch (e) {
        this.$store.commit(
          "notification/ephermalMessage",
          this.i18n.errorqr
        );
        return;
      }
      if (!urls.length) {
        this.$store.commit(
          "notification/ephermalMessage",
          this.i18n.export_qr_empty
        );
        return;
      }
      this.exportQrs = urls;
    },
    async downloadBackUpExportEncryptedFile() {
      if (!(await this.verifyBeforeExport())) {
        return;
      }
      const exportEncData = this.$store.state.accounts.exportEncData;
      const key = this.$store.state.accounts.key;
      const t = getBackupFile(exportEncData, key);
      window.open(t);
    },
  },
});

function hasUnsupportedAccounts(exportData: { [h: string]: RawOTPStorage }) {
  for (const entry of Object.keys(exportData)) {
    if (
      exportData[entry].type === "battle" ||
      exportData[entry].type === "steam"
    ) {
      return true;
    }
  }
  return false;
}

function getBackupFile(
  entryData: { [hash: string]: RawOTPStorage },
  key?: Object
) {
  if (key) {
    Object.assign(entryData, { key: key });
  }
  let json = JSON.stringify(entryData, null, 2);
  // for windows notepad
  json = json.replace(/\n/g, "\r\n");
  return downloadFileUrlBuilder(json);
}

function getOneLineOtpBackupFile(entryData: { [hash: string]: RawOTPStorage }) {
  const otpAuthLines: string[] = [];
  for (const hash of Object.keys(entryData)) {
    const otpStorage = entryData[hash];
    if (otpStorage.issuer) {
      otpStorage.issuer = removeUnsafeData(otpStorage.issuer);
    }
    if (otpStorage.account) {
      otpStorage.account = removeUnsafeData(otpStorage.account);
    }
    const label = otpStorage.issuer
      ? otpStorage.issuer + ":" + (otpStorage.account || "")
      : otpStorage.account || "";
    let type = "";
    if (otpStorage.type === "totp" || otpStorage.type === "hex") {
      type = "totp";
    } else if (otpStorage.type === "hotp" || otpStorage.type === "hhex") {
      type = "hotp";
    } else {
      continue;
    }

    const otpAuthLine =
      "otpauth://" +
      type +
      "/" +
      label +
      "?secret=" +
      otpStorage.secret +
      (otpStorage.issuer ? "&issuer=" + otpStorage.issuer : "") +
      (type === "hotp" ? "&counter=" + otpStorage.counter : "") +
      (type === "totp" && otpStorage.period
        ? "&period=" + otpStorage.period
        : "") +
      (otpStorage.digits ? "&digits=" + otpStorage.digits : "") +
      (otpStorage.algorithm ? "&algorithm=" + otpStorage.algorithm : "");

    otpAuthLines.push(otpAuthLine);
  }

  return downloadFileUrlBuilder(otpAuthLines.join("\r\n"));
}

function downloadFileUrlBuilder(content: string) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  return URL.createObjectURL(blob);
}

function removeUnsafeData(data: string) {
  return encodeURIComponent(data.split("::")[0].replace(/:/g, ""));
}
</script>
