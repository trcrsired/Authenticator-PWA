// Web implementation of chrome.permissions. The web has no host permissions —
// cross-origin access is governed by CORS, so `origins` checks always pass.
// Named permissions are mapped to the closest web capability and evaluated
// via feature detection / the Permissions API where possible.

interface PermissionsShim {
  permissions?: string[];
  origins?: string[];
}

async function evalPermission(permission: string): Promise<boolean> {
  switch (permission) {
    case "clipboardWrite":
      return typeof navigator.clipboard?.write === "function" ||
        document.queryCommandSupported?.("copy") === true
        ? true
        : true; // execCommand fallback in EntryComponent still works
    case "contextMenus":
      // No context menus on the web; report granted so the toggle can be
      // switched on harmlessly (it is a no-op).
      return true;
    case "activeTab":
    case "storage":
    case "identity":
    case "alarms":
    case "scripting":
    case "tabs":
      return true;
    default:
      try {
        const status = await navigator.permissions.query({
          name: permission as PermissionName,
        });
        return status.state !== "denied";
      } catch {
        return true;
      }
  }
}

async function evalAll(request: PermissionsShim): Promise<boolean> {
  for (const permission of request.permissions ?? []) {
    if (!(await evalPermission(permission))) {
      return false;
    }
  }
  return true;
}

export const permissionsShim = {
  contains(
    permissions: PermissionsShim,
    callback?: (result: boolean) => void
  ): Promise<boolean> {
    const result = evalAll(permissions);
    if (callback) {
      result.then(callback);
    }
    return result;
  },
  request(
    permissions: PermissionsShim,
    callback?: (granted: boolean) => void
  ): Promise<boolean> {
    const result = evalAll(permissions);
    if (callback) {
      result.then(callback);
    }
    return result;
  },
  remove(
    permissions: PermissionsShim,
    callback?: (removed: boolean) => void
  ): Promise<boolean> {
    void permissions;
    if (callback) {
      setTimeout(() => callback(true), 0);
    }
    return Promise.resolve(true);
  },
  getAll(callback?: (permissions: PermissionsShim) => void) {
    const result = evalPermission("clipboardWrite").then((clipboard) => ({
      permissions: [
        "storage",
        "alarms",
        ...(clipboard ? ["clipboardWrite"] : []),
      ],
      origins: [] as string[],
    }));
    if (callback) {
      result.then(callback);
    }
    return result;
  },
};
