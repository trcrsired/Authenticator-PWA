<template>
  <div class="import_file">
    <label :for="inputId">{{ label }}</label>
    <div class="import_file_name">{{ fileNameText }}</div>
    <input
      :id="inputId"
      type="file"
      v-on="$listeners"
      :accept="accept"
      :multiple="multiple"
      @change="onChange"
    />
  </div>
</template>
<script lang="ts">
import Vue from "vue";

let uidCounter = 0;

export default Vue.extend({
  props: ["label", "multiple", "accept"],
  data() {
    return {
      fileNames: "",
      inputId: `import_file_${++uidCounter}`,
    };
  },
  computed: {
    fileNameText(): string {
      return (
        this.fileNames || this.i18n.no_file_chosen || "No file chosen"
      );
    },
  },
  methods: {
    onChange(event: Event) {
      const target = event.target as HTMLInputElement;
      const files = target?.files;
      this.fileNames =
        files && files.length
          ? Array.from(files)
              .map((f) => f.name)
              .join(", ")
          : "";
    },
  },
});
</script>
