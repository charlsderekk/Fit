/* =========================================================
   FitAI storage layer.
   All app data lives in localStorage under one key, as JSON.
   No backend/database — this keeps deployment to a plain
   static host (GitHub Pages / Netlify) simple.
   ========================================================= */

function storageKeyFor(username) {
  return `fitai_state_v1_${username}`;
}

function defaultState() {
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
    meta: { lastAdaptedAt: null, remindersNotifiedToday: {} },
  };
}

const State = {
  data: defaultState(),
  key: null,

  /* username is the logged-in account's key (from auth.js) — each
     account gets its own isolated slice of localStorage. */
  load(username) {
    this.key = storageKeyFor(username);
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...defaultState(), ...parsed };
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

/* ---------- small helpers used across modules ---------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function dateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dateStr(d);
}

function startOfWeekStr() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return dateStr(d);
}

function isInCurrentWeek(dstr) {
  return dstr >= startOfWeekStr() && dstr <= todayStr();
}

/* Consecutive-day workout streak, counting back from today or yesterday. */
function computeWorkoutStreak(workoutLog) {
  const loggedDates = new Set(workoutLog.map((w) => w.date));
  let streak = 0;
  let cursor = new Date();

  // if nothing logged today, streak can still count from yesterday backward
  if (!loggedDates.has(dateStr(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (loggedDates.has(dateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function sum(arr, fn) {
  return arr.reduce((acc, item) => acc + (fn(item) || 0), 0);
}
