import { UserSettings } from "./settings";

// Resolves the persisted theme + dark-mode settings into root theme
// classes, for entry pages without a Vuex store (import/options). The
// popup computes the same thing reactively from menu state.
export function resolveThemeClasses(): string[] {
  let theme = UserSettings.items.theme || "normal";
  // Legacy values: "dark"/"auto" migrated to the darkMode axis.
  if (theme === "dark" || theme === "auto") {
    theme = "normal";
  }
  const darkMode =
    UserSettings.items.darkMode ||
    (UserSettings.items.theme === "dark" ? "dark" : "auto");
  const classes = [`theme-${theme}`];
  if (
    theme !== "accessibility" &&
    (darkMode === "dark" ||
      (darkMode === "auto" &&
        typeof matchMedia === "function" &&
        matchMedia("(prefers-color-scheme: dark)").matches))
  ) {
    classes.push("theme-dark");
  }
  return classes;
}
