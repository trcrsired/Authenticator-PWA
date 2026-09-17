import { Encryption } from "./models/encryption";
import { EntryStorage, ManagedStorage } from "./models/storage";
import { getOTPAuthPerLineFromOPTAuthMigration } from "./models/migration";
import { UserSettings } from "./models/settings";

// In-page replacement for the extension's background service worker. QR
// screen capture and cloud backup auth don't exist in the PWA; the remaining
// handlers (passphrase caching, autolock, otpauth text import) are preserved.

chrome.runtime.onMessage.addListener(async (message) => {
  await UserSettings.updateItems();

  if (message.action === "getTotp") {
    getTotp(message.info);
  } else if (message.action === "cachePassphrase") {
    chrome.storage.session.set({
      cachedPassphrase: message.value,
      cachedKeyId: message.keyId,
    });
    chrome.alarms.clear("autolock");
    setAutolock();
  } else if (message.action === "lock") {
    chrome.storage.session.set({ cachedPassphrase: null, cachedKeyId: null });
  } else if (message.action === "resetAutolock") {
    chrome.alarms.clear("autolock");
    setAutolock();
  }

  // https://stackoverflow.com/a/56483156
  return true;
});

chrome.alarms.onAlarm.addListener(() => {
  chrome.storage.session.set({ cachedPassphrase: null, cachedKeyId: null });
  chrome.runtime.sendMessage({ action: "stopImport" });

  // https://stackoverflow.com/a/56483156
  return true;
});

function notify(action: string, info?: { account?: string; text?: string; secret?: string }) {
  switch (action) {
    case "added":
      alert((info?.account ?? "") + chrome.i18n.getMessage("added"));
      break;
    case "text":
      alert(info?.text ?? "");
      break;
    case "secretqr":
      alert(chrome.i18n.getMessage("errorsecret") + (info?.secret ?? ""));
      break;
    case "errorqr":
      alert(chrome.i18n.getMessage("errorqr"));
      break;
    case "errorenc":
      alert(chrome.i18n.getMessage("phrase_incorrect"));
      break;
    case "migrationfail":
      alert(chrome.i18n.getMessage("migration_fail"));
      break;
    case "migrationpartlyfail":
      alert(chrome.i18n.getMessage("migration_partly_fail"));
      break;
    case "migrationsuccess":
      alert(chrome.i18n.getMessage("updateSuccess"));
      break;
    default:
      break;
  }
}

async function getTotp(text: string, silent = false) {
  if (!text) {
    return false;
  }

  if (text.indexOf("otpauth://") !== 0) {
    if (text.indexOf("otpauth-migration://") === 0) {
      const otpUrls = getOTPAuthPerLineFromOPTAuthMigration(text);
      if (otpUrls.length === 0) {
        !silent && notify("errorenc");
        return false;
      }

      const getTotpPromises: Array<Promise<boolean>> = [];
      for (const otpUrl of otpUrls) {
        getTotpPromises.push(getTotp(otpUrl, true));
      }

      const getTotpResults = await Promise.allSettled(getTotpPromises);
      const failedCount = getTotpResults.filter((res) => !res).length;
      if (failedCount === otpUrls.length) {
        !silent && notify("migrationfail");
        return false;
      }

      if (failedCount > 0) {
        !silent && notify("migrationpartlyfail");
        return true;
      }

      !silent && notify("migrationsuccess");
      return true;
    } else if (text === "error decoding QR Code") {
      !silent && notify("errorqr");
      return false;
    } else {
      !silent && notify("text", { text });
      return true;
    }
  } else {
    let uri = text.split("otpauth://")[1];
    let type = uri.substr(0, 4).toLowerCase();
    uri = uri.substr(5);
    let label = uri.split("?")[0];
    const parameterPart = uri.split("?")[1];
    if (!label || !parameterPart) {
      !silent && notify("errorqr");
      return false;
    } else {
      let secret = "";
      let account: string | undefined;
      let issuer: string | undefined;
      let algorithm: string | undefined;
      let period: number | undefined;
      let digits: number | undefined;

      try {
        label = decodeURIComponent(label);
      } catch (error) {
        console.error(error);
      }
      if (label.indexOf(":") !== -1) {
        issuer = label.split(":")[0];
        account = label.split(":")[1];
      } else {
        account = label;
      }
      const parameters = parameterPart.split("&");
      const { cachedPassphrase, cachedKeyId } =
        await chrome.storage.session.get();
      parameters.forEach((item) => {
        const parameter = item.split("=");
        if (parameter[0].toLowerCase() === "secret") {
          secret = parameter[1];
        } else if (parameter[0].toLowerCase() === "issuer") {
          try {
            issuer = decodeURIComponent(parameter[1]);
          } catch {
            issuer = parameter[1];
          }
          issuer = issuer.replace(/\+/g, " ");
        } else if (parameter[0].toLowerCase() === "counter") {
          // let counter = Number(parameter[1]);
          // counter = isNaN(counter) || counter < 0 ? 0 : counter;
        } else if (parameter[0].toLowerCase() === "period") {
          period = Number(parameter[1]);
          period =
            isNaN(period) || period < 0 || period > 60 || 60 % period !== 0
              ? undefined
              : period;
        } else if (parameter[0].toLowerCase() === "digits") {
          digits = Number(parameter[1]);
          digits = isNaN(digits) || digits === 0 ? 6 : digits;
        } else if (parameter[0].toLowerCase() === "algorithm") {
          algorithm = parameter[1];
        }
      });

      if (!secret) {
        !silent && notify("errorqr");
        return false;
      } else if (
        !/^[0-9a-f]+$/i.test(secret) &&
        !/^[2-7a-z]+=*$/i.test(secret)
      ) {
        !silent && notify("secretqr", { secret });
        return false;
      } else {
        const encryption = new Encryption(cachedPassphrase, cachedKeyId);
        const hash = crypto.randomUUID();
        if (
          !/^[2-7a-z]+=*$/i.test(secret) &&
          /^[0-9a-f]+$/i.test(secret) &&
          type === "totp"
        ) {
          type = "hex";
        } else if (
          !/^[2-7a-z]+=*$/i.test(secret) &&
          /^[0-9a-f]+$/i.test(secret) &&
          type === "hotp"
        ) {
          type = "hhex";
        }
        const entryData: { [hash: string]: RawOTPStorage } = {};
        entryData[hash] = {
          account,
          hash,
          issuer,
          secret,
          type,
          encrypted: false,
          index: 0,
          counter: 0,
          pinned: false,
        };
        if (period) {
          entryData[hash].period = period;
        }
        if (digits) {
          entryData[hash].digits = digits;
        }
        if (algorithm) {
          entryData[hash].algorithm = algorithm;
        }
        if (
          // If the entries are encrypted and we aren't unlocked, error.
          (await EntryStorage.hasEncryptionKey()) !==
          encryption.getEncryptionStatus()
        ) {
          !silent && notify("errorenc");
          return false;
        }
        await EntryStorage.import(encryption, entryData);
        !silent && notify("added", { account });
        return true;
      }
    }
  }
}

async function setAutolock() {
  const enforcedAutolock = Number(
    await ManagedStorage.get("enforceAutolock", false)
  );

  if (enforcedAutolock && enforcedAutolock > 0) {
    chrome.alarms.create("autolock", { delayInMinutes: enforcedAutolock });
    return;
  }

  // Set default autolock value
  if (UserSettings.items.autolock === undefined) {
    UserSettings.items.autolock = 30;
  }

  if (Number(UserSettings.items.autolock) > 0) {
    chrome.alarms.create("autolock", {
      delayInMinutes: Number(UserSettings.items.autolock),
    });
  }
}
