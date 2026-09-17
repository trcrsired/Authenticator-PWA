<template>
  <div class="control-group">
    <label class="combo-label">{{ label }}</label>
    <input
      class="checkbox"
      type="checkbox"
      :checked="checked"
      @change="onChange"
    />
  </div>
</template>
<script lang="ts">
import Vue from "vue";

export default Vue.extend({
  props: {
    label: String,
    checked: Boolean,
  },
  model: {
    prop: "checked",
    event: "change",
  },
  methods: {
    onChange(e: Event) {
      const input = e.target as HTMLInputElement;
      this.$emit("change", input.checked);
      // Async v-model setters (e.g. WebAuthn enrollment) may reject the
      // change — prop stays the same so Vue never patches the checkbox.
      // Re-assert the bound value; a later successful commit updates it
      // via the watcher.
      this.$nextTick(() => {
        input.checked = this.checked;
      });
    },
  },
  watch: {
    checked(value: boolean) {
      const input = this.$el.querySelector("input");
      if (input) {
        input.checked = value;
      }
    },
  },
});
</script>
