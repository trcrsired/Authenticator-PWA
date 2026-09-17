<template>
  <ImportView v-bind:initial-tab="importTab" />
</template>
<script lang="ts">
import Vue from "vue";
import ImportView from "../Import.vue";
import { Encryption } from "../../models/encryption";

export default Vue.extend({
  computed: {
    importTab(): string {
      return this.$store.state.currentView.param;
    },
  },
  created() {
    // The Import sub-components read these off Vue.prototype (they were set
    // by import.ts when it was a standalone page). Provide live getters so
    // they always see the store's current entries/encryption.
    const store = this.$store;
    Object.defineProperty(Vue.prototype, "$entries", {
      configurable: true,
      get: () => store.state.accounts.entries,
    });
    Object.defineProperty(Vue.prototype, "$encryption", {
      configurable: true,
      get: () =>
        store.state.accounts.encryption.get(
          store.state.accounts.defaultEncryption
        ) ?? new Encryption("", ""),
    });
  },
  components: {
    ImportView,
  },
});
</script>
