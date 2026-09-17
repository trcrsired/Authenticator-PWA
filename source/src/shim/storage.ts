// Web implementation of chrome.storage backed by localStorage/sessionStorage.
// Keys are namespaced per storage area so `local` and `sync` stay distinct
// like they do in the extension (there is no real sync backend on the web).

type StorageItems = Record<string, unknown>;
type GetKeys = string | string[] | StorageItems | null | undefined;
type Callback<T> = (result: T) => void;

class WebStorageArea {
  constructor(
    private prefix: string,
    private backend: Storage
  ) {}

  private fullKey(key: string) {
    return this.prefix + key;
  }

  private all(): StorageItems {
    const items: StorageItems = {};
    for (let i = 0; i < this.backend.length; i++) {
      const key = this.backend.key(i);
      if (key === null || !key.startsWith(this.prefix)) {
        continue;
      }
      const raw = this.backend.getItem(key);
      try {
        items[key.slice(this.prefix.length)] =
          raw === null ? undefined : JSON.parse(raw);
      } catch (e) {
        console.error("Failed to parse stored value for", key, e);
      }
    }
    return items;
  }

  get(callback?: Callback<StorageItems>): Promise<StorageItems>;
  get(keys: GetKeys, callback?: Callback<StorageItems>): Promise<StorageItems>;
  get(
    keysOrCallback?: GetKeys | Callback<StorageItems>,
    callback?: Callback<StorageItems>
  ): Promise<StorageItems> {
    let keys: GetKeys = null;
    if (typeof keysOrCallback === "function") {
      callback = keysOrCallback;
    } else {
      keys = keysOrCallback ?? null;
    }

    const all = this.all();
    let result: StorageItems = {};
    if (keys === null || keys === undefined) {
      result = all;
    } else if (typeof keys === "string") {
      if (keys in all) {
        result[keys] = all[keys];
      }
    } else if (Array.isArray(keys)) {
      for (const key of keys) {
        if (key in all) {
          result[key] = all[key];
        }
      }
    } else {
      // object form: keys map to defaults
      for (const key of Object.keys(keys)) {
        result[key] = key in all ? all[key] : keys[key];
      }
    }

    if (callback) {
        setTimeout(() => callback(result), 0);
    }
    return Promise.resolve(result);
  }

  set(items: StorageItems, callback?: () => void): Promise<void> {
    for (const key of Object.keys(items)) {
      const value = items[key];
      if (value === undefined) {
        this.backend.removeItem(this.fullKey(key));
      } else {
        this.backend.setItem(this.fullKey(key), JSON.stringify(value));
      }
    }
    if (callback) {
      setTimeout(callback, 0);
    }
    return Promise.resolve();
  }

  remove(keys: string | string[], callback?: () => void): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.backend.removeItem(this.fullKey(key));
    }
    if (callback) {
      setTimeout(callback, 0);
    }
    return Promise.resolve();
  }

  clear(callback?: () => void): Promise<void> {
    const keys: string[] = [];
    for (let i = 0; i < this.backend.length; i++) {
      const key = this.backend.key(i);
      if (key !== null && key.startsWith(this.prefix)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      this.backend.removeItem(key);
    }
    if (callback) {
      setTimeout(callback, 0);
    }
    return Promise.resolve();
  }
}

// There is no managed (policy) storage on the web; resolve to empty so all
// lookups fall back to defaults.
class ManagedStorageArea {
  get(keys?: GetKeys, callback?: Callback<StorageItems>): Promise<StorageItems> {
    let result: StorageItems = {};
    if (keys !== null && keys !== undefined && typeof keys === "object" && !Array.isArray(keys)) {
      result = { ...keys };
    }
    if (callback) {
      setTimeout(() => callback(result), 0);
    }
    return Promise.resolve(result);
  }
}

export const storageShim = {
  local: new WebStorageArea("auth:local:", localStorage),
  sync: new WebStorageArea("auth:sync:", localStorage),
  session: new WebStorageArea("auth:session:", sessionStorage),
  managed: new ManagedStorageArea(),
};
