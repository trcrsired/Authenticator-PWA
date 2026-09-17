// Web implementation of chrome.alarms backed by setTimeout. Alarm deadlines
// are persisted to localStorage so an autolock scheduled before a reload
// still fires (immediately, if overdue) on the next visit.

interface AlarmInfo {
  delayInMinutes?: number;
  periodInMinutes?: number;
  when?: number;
}

interface Alarm {
  name: string;
  scheduledTime: number;
  periodInMinutes?: number;
}

type AlarmListener = (alarm: Alarm) => void;

const PERSIST_KEY = "auth:alarms";
const timers = new Map<string, number>();
const listeners = new Set<AlarmListener>();

function loadPersisted(): Record<
  string,
  { scheduledTime: number; periodInMinutes?: number }
> {
  try {
    return JSON.parse(localStorage.getItem(PERSIST_KEY) || "{}");
  } catch {
    return {};
  }
}

function persist() {
  const data: ReturnType<typeof loadPersisted> = {};
  for (const [name, alarm] of scheduled) {
    data[name] = {
      scheduledTime: alarm.scheduledTime,
      periodInMinutes: alarm.periodInMinutes,
    };
  }
  localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
}

const scheduled = new Map<string, Alarm>();

function fire(alarm: Alarm) {
  timers.delete(alarm.name);
  scheduled.delete(alarm.name);
  persist();
  for (const listener of listeners) {
    try {
      listener(alarm);
    } catch (e) {
      console.error("Error in alarm listener", e);
    }
  }
  if (alarm.periodInMinutes) {
    create(alarm.name, { periodInMinutes: alarm.periodInMinutes });
  }
}

function create(name: string, alarmInfo: AlarmInfo) {
  clear(name);
  const delayMs =
    alarmInfo.when !== undefined
      ? alarmInfo.when - Date.now()
      : (alarmInfo.delayInMinutes ?? 0) * 60 * 1000;
  const alarm: Alarm = {
    name,
    scheduledTime: Date.now() + Math.max(0, delayMs),
    periodInMinutes: alarmInfo.periodInMinutes,
  };
  scheduled.set(name, alarm);
  persist();
  timers.set(
    name,
    window.setTimeout(() => fire(alarm), Math.max(0, delayMs))
  );
}

function clear(name?: string, callback?: (wasCleared: boolean) => void) {
  let cleared = false;
  const names = name !== undefined ? [name] : [...scheduled.keys()];
  for (const n of names) {
    const timer = timers.get(n);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(n);
    }
    cleared = scheduled.delete(n) || cleared;
  }
  persist();
  if (callback) {
    setTimeout(() => callback(cleared), 0);
  }
  return Promise.resolve(cleared);
}

// Reschedule persisted alarms after a reload.
for (const [name, data] of Object.entries(loadPersisted())) {
  const alarm: Alarm = {
    name,
    scheduledTime: data.scheduledTime,
    periodInMinutes: data.periodInMinutes,
  };
  scheduled.set(name, alarm);
  const remaining = data.scheduledTime - Date.now();
  timers.set(
    name,
    window.setTimeout(() => fire(alarm), Math.max(0, remaining))
  );
}

export const alarmsShim = {
  create,
  clear,
  get: (name: string, callback?: (alarm: Alarm | undefined) => void) => {
    const alarm = scheduled.get(name);
    if (callback) {
      setTimeout(() => callback(alarm), 0);
    }
    return Promise.resolve(alarm);
  },
  getAll: (callback?: (alarms: Alarm[]) => void) => {
    const alarms = [...scheduled.values()];
    if (callback) {
      setTimeout(() => callback(alarms), 0);
    }
    return Promise.resolve(alarms);
  },
  onAlarm: {
    addListener: (listener: AlarmListener) => listeners.add(listener),
    removeListener: (listener: AlarmListener) => listeners.delete(listener),
    hasListener: (listener: AlarmListener) => listeners.has(listener),
  },
};
