import { UserSettings } from "./models/settings";

// The extension synced with google.com's Date header, which isn't reachable
// cross-origin from a PWA. Sync against our own origin's Date header instead —
// any correctly-configured server clock works for detecting client drift.
export async function syncTimeWithGoogle() {
  await UserSettings.updateItems();

  return new Promise(
    (resolve: (value: string) => void, reject: (reason: Error) => void) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open("HEAD", location.origin + "/");
        const xhrAbort = setTimeout(() => {
          xhr.abort();
          return resolve("updateFailure");
        }, 5000);
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            clearTimeout(xhrAbort);
            const date = xhr.getResponseHeader("date");
            if (!date) {
              return resolve("updateFailure");
            }
            const serverTime = new Date(date).getTime();
            const clientTime = new Date().getTime();
            const offset = Math.round((serverTime - clientTime) / 1000);

            if (Math.abs(offset) <= 300) {
              // within 5 minutes
              UserSettings.items.offset = Math.round(
                (serverTime - clientTime) / 1000
              );
              UserSettings.commitItems();
              return resolve("updateSuccess");
            } else {
              return resolve("clock_too_far_off");
            }
          }
        };
        xhr.send();
      } catch (error) {
        return reject(error as Error);
      }
    }
  );
}
