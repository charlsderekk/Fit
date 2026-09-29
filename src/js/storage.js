/* =========================================================
   FitAI Storage Layer
   All app data lives in localStorage as structured JSON.
   ========================================================= */

export function storageKeyFor(username) {
  return `fitai_state_v1_${username}`;
}

export function defaultState() {
  return {
    profile: null,
    plan: null,
    workoutLog: [],
    foodLog: [],
    weightLog: [],
    goals: [],
    achievements: [],
    reminders: [],
    chatHistory: [],
    meta: {
      lastAdaptedAt: null,
      remindersNotifiedToday: {},
    },
  };
}

export const State = {
  data: defaultState(),
  key: null,

  load(username = "local") {
    this.key = storageKeyFor(username);
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = {
          ...defaultState(),
          ...parsed,
          meta: {
            ...defaultState().meta,
            ...(parsed.meta || {}),
          },
        };
      } else {
        this.data = defaultState();
      }
    } catch (e) {
      console.warn("Could not load saved data, starting fresh.", e);
      this.data = defaultState();
    }
    return this.data;
  },

  save() {
    if (!this.key) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {
      console.error("Could not save data.", e);
    }
  },

  reset() {
    this.data = defaultState();
    this.save();
  },
};

/* ---------- Shared Helpers ---------- */

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function dateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateStr(d);
}

export function startOfWeekStr() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return dateStr(d);
}

export function isInCurrentWeek(dstr) {
  return dstr >= startOfWeekStr() && dstr <= todayStr();
}

/**
 * Consecutive-day workout streak, counting back from today or yesterday.
 */
export function computeWorkoutStreak(workoutLog = []) {
  const loggedDates = new Set(workoutLog.map((w) => w.date));
  let streak = 0;
  let cursor = new Date();

  // If nothing logged today, streak can still count from yesterday backward
  if (!loggedDates.has(dateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (loggedDates.has(dateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function sum(arr = [], fn) {
  return arr.reduce((acc, item) => acc + (fn(item) || 0), 0);
}
