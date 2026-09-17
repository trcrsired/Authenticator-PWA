// In-page replacement for chrome.runtime.sendMessage / onMessage and
// chrome.tabs.sendMessage. The extension's background page and content
// scripts run in separate contexts; in the PWA everything shares one
// context so a single event bus is enough.

export interface MessageSenderShim {
  id: string;
  tab?: { id: number; windowId: number; url?: string; title?: string };
}

export type MessageListener = (
  message: unknown,
  sender: MessageSenderShim,
  sendResponse: (response?: unknown) => void
) => unknown;

const listeners = new Set<MessageListener>();

export function addMessageListener(listener: MessageListener) {
  listeners.add(listener);
}

export function removeMessageListener(listener: MessageListener) {
  listeners.delete(listener);
}

export function hasMessageListener(listener: MessageListener) {
  return listeners.has(listener);
}

export async function dispatchMessage(
  message: unknown,
  callback?: (response?: unknown) => void,
  sender: MessageSenderShim = { id: "authenticator-pwa" }
): Promise<unknown> {
  let response: unknown;
  const sendResponse = (r?: unknown) => {
    response = r;
  };

  for (const listener of [...listeners]) {
    try {
      const ret = listener(message, sender, sendResponse);
      if (ret instanceof Promise) {
        await ret;
      }
    } catch (e) {
      console.error("Error in message listener", e);
    }
  }

  if (callback) {
    callback(response);
  }
  return response;
}
