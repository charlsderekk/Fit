/* =========================================================
   FitAI — UI Layer
   Organized by feature module. Each module has a render()
   function plus handlers wired during initialization.
   ========================================================= */

import Chart from "chart.js/auto";
import {
  State,
  uid,
  todayStr,
  dateStr,
  daysAgo,
  isInCurrentWeek,
  computeWorkoutStreak,
  sum,
} from "./storage.js";
import {
  generateJSON,
  generateChatReply,
  buildInitialPlanPrompt,
  buildAdaptivePlanPrompt,
  buildCalorieEstimatePrompt,
  buildChatSystemInstruction,
} from "./gemini.js";

const charts = {};

/* ---------------- Shared Helpers ---------------- */

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

export function showToast(message, isError = false) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = `toast ${isError ? "toast-error" : ""}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/** Minimal Markdown -> HTML for AI chat replies */
export function markdownToHtml(md) {
  const escaped = escapeHtml(md);
  const lines = escaped.split("\n");
  let html = "";
  let inList = null;

  const closeList = () => {
    if (inList) { html += `</${inList}>`; inList = null; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }

    const heading = line.match(/^#{1,4}\s+(.*)/);
    if (heading) { closeList(); html += `<p><strong>${inlineFmt(heading[1])}</strong></p>`; continue; }

    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet) {
      if (inList !== "ul") { closeList(); html += "<ul>"; inList = "ul"; }
      html += `<li>${inlineFmt(bullet[1])}</li>`; continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.*)/);
    if (numbered) {
      if (inList !== "ol") { closeList(); html += "<ol>"; inList = "ol"; }
      html += `<li>${inlineFmt(numbered[1])}</li>`; continue;
    }

    closeList();
    html += `<p>${inlineFmt(line)}</p>`;
  }
  closeList();
  return html;
}

function inlineFmt(t) {
  return t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/* ---------------- Navigation ---------------- */

const RENDERERS = {
  dashboard: renderDashboard,
  plan: renderPlan,
  chat: renderChat,
  workouts: renderWorkouts,
  nutrition: renderNutrition,
  weight: renderWeight,
  goals: renderGoals,
  reminders: renderReminders,
  profile: renderProfileForm,
};

export function setActiveView(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("active", v.id === `view-${name}`);
  });
  if (RENDERERS[name]) RENDERERS[name]();
}

export function initNav() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.goto));
  });
}

/* =========================================================
   PROFILE MODULE
   ========================================================= */

export function renderProfileForm() {
  const p = State.data.profile;
  const submitBtn = document.getElementById("profile-submit");
  if (!submitBtn) return;

  if (p) {
    document.getElementById("p-age").value = p.age || "";
    document.getElementById("p-sex").value = p.sex || "Male";
    document.getElementById("p-height").value = p.height || "";
    document.getElementById("p-weight").value = p.weight || "";
    document.getElementById("p-target-weight").value = p.targetWeight || "";
    document.getElementById("p-goal").value = p.goal || "Build muscle";
    document.getElementById("p-experience").value = p.experience || "Beginner";
    document.getElementById("p-days").value = p.days || 3;
    document.getElementById("p-equipment").value = p.equipment || "Full gym";
    document.getElementById("p-diet").value = p.diet || "No restrictions";
    document.getElementById("p-limitations").value = p.limitations || "";
    submitBtn.textContent = "Save changes";
  } else {
    submitBtn.textContent = "Save profile & generate plan";
  }
}

export function initProfileModule() {
  const form = document.getElementById("profile-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hadProfileBefore = !!State.data.profile;
    const profile = {
      age: document.getElementById("p-age").value,
      sex: document.getElementById("p-sex").value,
      height: document.getElementById("p-height").value,
      weight: parseFloat(document.getElementById("p-weight").value),
      targetWeight: document.getElementById("p-target-weight").value
        ? parseFloat(document.getElementById("p-target-weight").value)
        : null,
      goal: document.getElementById("p-goal").value,
      experience: document.getElementById("p-experience").value,
      days: parseInt(document.getElementById("p-days").value, 10),
      equipment: document.getElementById("p-equipment").value,
      diet: document.getElementById("p-diet").value,
      limitations: document.getElementById("p-limitations").value.trim(),
    };
    State.data.profile = profile;
    State.save();
    checkAchievements();
    showToast(hadProfileBefore ? "Profile updated." : "Profile saved!");

    if (!hadProfileBefore || !State.data.plan) {
      setActiveView("plan");
      await generateInitialPlan();
    }
  });
}

/* =========================================================
   PLAN MODULE
   ========================================================= */

export function canAdaptPlan() {
  return State.data.weightLog.length >= 2 || State.data.workoutLog.length >= 3;
}

export function buildProgressSummaryText() {
  const { weightLog, workoutLog, profile } = State.data;
  const lines = [];

  if (weightLog.length >= 2) {
    const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const delta = (last.weight - first.weight).toFixed(1);
    lines.push(`Weight: ${first.weight}kg (${first.date}) → ${last.weight}kg (${last.date}), change: ${delta}kg.`);
  } else {
    lines.push("Not enough weight log entries yet.");
  }

  const recentWorkouts = workoutLog.filter((w) => w.date >= daysAgo(14));
  const expected = (profile?.days || 3) * 2;
  lines.push(`Logged ${recentWorkouts.length} workouts in the last 14 days (target ~${expected}).`);
  lines.push(`Current workout streak: ${computeWorkoutStreak(workoutLog)} day(s).`);

  return lines.map((l) => `- ${l}`).join("\n");
}

export function renderPlanHTML(plan) {
  let html = "";
  if (plan.whatChanged) {
    html += `<div class="day-block what-changed"><div class="what-changed-label">✦ What changed</div><p>${escapeHtml(plan.whatChanged)}</p></div>`;
  }
  html += `<p class="plan-overview">${escapeHtml(plan.overview || "")}</p>`;

  if (Array.isArray(plan.weeklySplit) && plan.weeklySplit.length) {
    html += `<h3>Weekly Split</h3><ul class="plan-list">${plan.weeklySplit.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
  }

  if (Array.isArray(plan.days) && plan.days.length) {
    html += `<h3>Day-by-Day Schedule</h3>`;
    plan.days.forEach((d) => {
      html += `<div class="day-block">
        <div class="day-block-header">
          <span class="day-tag">${escapeHtml(d.day || "Day")}</span>
          <span class="day-focus">${escapeHtml(d.focus || "Routine")}</span>
        </div>
        <ul class="exercise-list">`;
      (d.exercises || []).forEach((ex) => {
        html += `<li><span class="ex-name-plan">${escapeHtml(ex.name || "")}</span><span class="ex-sets-plan">${escapeHtml(String(ex.sets || 3))} sets × ${escapeHtml(String(ex.reps || "8-12"))}</span></li>`;
      });
      html += `</ul></div>`;
    });
  }

  const n = plan.nutrition;
  if (n) {
    html += `<h3>Daily Nutrition Targets</h3>
      <div class="nutrition-grid">
        <div class="n-item"><div class="n-val">${escapeHtml(String(n.dailyCalories || 2000))}</div><div class="n-label">Calories</div></div>
        <div class="n-item"><div class="n-val">${escapeHtml(String(n.proteinG || 140))}g</div><div class="n-label">Protein</div></div>
        <div class="n-item"><div class="n-val">${escapeHtml(String(n.carbsG || 200))}g</div><div class="n-label">Carbs</div></div>
        <div class="n-item"><div class="n-val">${escapeHtml(String(n.fatG || 65))}g</div><div class="n-label">Fat</div></div>
      </div>`;

    if (Array.isArray(n.mealIdeas) && n.mealIdeas.length) {
      html += `<h3>Meal Ideas</h3><ul class="plan-list">${n.mealIdeas.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`;
    }
  }

  if (Array.isArray(plan.notes) && plan.notes.length) {
    html += `<h3>Trainer Notes</h3><ul class="plan-list">${plan.notes.map((n2) => `<li>${escapeHtml(n2)}</li>`).join("")}</ul>`;
  }

  return html;
}

export function renderPlan() {
  const hasProfile = !!State.data.profile;
  document.getElementById("plan-empty")?.classList.toggle("hidden", hasProfile);
  document.getElementById("plan-content")?.classList.toggle("hidden", !hasProfile);
  if (!hasProfile) return;

  const plan = State.data.plan;
  const bodyEl = document.getElementById("plan-body");
  if (bodyEl) {
    bodyEl.innerHTML = plan
      ? renderPlanHTML(plan)
      : `<p class="placeholder">No plan yet — click "Regenerate plan" to create one.</p>`;
  }

  const adaptBtn = document.getElementById("btn-adapt-plan");
  const eligible = plan && canAdaptPlan();
  if (adaptBtn) adaptBtn.disabled = !eligible;

  const hintEl = document.getElementById("adapt-hint");
  if (hintEl) {
    hintEl.textContent = !plan
      ? ""
      : eligible
      ? "✓ Ready to adapt based on your logged progress."
      : "Log at least 2 weigh-ins or 3 workouts to unlock adaptive re-planning.";
  }
}

export async function generateInitialPlan() {
  const bodyEl = document.getElementById("plan-body");
  if (bodyEl) bodyEl.innerHTML = `<div class="loading-text"><span class="spinner"></span>Building your personalized plan with Gemini AI…</div>`;

  try {
    const plan = await generateJSON(buildInitialPlanPrompt(State.data.profile));
    plan.generatedAt = new Date().toISOString();
    State.data.plan = plan;
    State.save();
    checkAchievements();
    renderPlan();
    showToast("🎉 Your plan is ready!");
  } catch (err) {
    if (bodyEl) {
      bodyEl.innerHTML = `<div class="error-box"><strong>Plan generation failed:</strong><br>${escapeHtml(err.message)}</div>`;
    }
  }
}

export async function handleAdaptPlan() {
  const btn = document.getElementById("btn-adapt-plan");
  if (btn) btn.disabled = true;

  const bodyEl = document.getElementById("plan-body");
  const prevHtml = bodyEl ? bodyEl.innerHTML : "";
  if (bodyEl) bodyEl.innerHTML = `<div class="loading-text"><span class="spinner"></span>Reviewing your progress and adapting your plan…</div>`;

  try {
    const progressSummary = buildProgressSummaryText();
    const plan = await generateJSON(
      buildAdaptivePlanPrompt(State.data.profile, State.data.plan, progressSummary)
    );
    plan.generatedAt = new Date().toISOString();
    State.data.plan = plan;
    State.data.meta.lastAdaptedAt = new Date().toISOString();
    State.save();
    checkAchievements();
    renderPlan();
    showToast("Plan adapted to your progress!");
  } catch (err) {
    if (bodyEl) bodyEl.innerHTML = prevHtml;
    showToast("Couldn't adapt plan: " + err.message, true);
  } finally {
    renderPlan();
  }
}

export function initPlanModule() {
  document.getElementById("btn-generate-plan")?.addEventListener("click", generateInitialPlan);
  document.getElementById("btn-adapt-plan")?.addEventListener("click", handleAdaptPlan);
}

/* =========================================================
   CHAT MODULE
   ========================================================= */

export function renderChat() {
  const hasProfile = !!State.data.profile;
  document.getElementById("chat-empty")?.classList.toggle("hidden", hasProfile);
  document.getElementById("chat-content")?.classList.toggle("hidden", !hasProfile);
  if (!hasProfile) return;

  const box = document.getElementById("chat-messages");
  if (!box) return;

  if (State.data.chatHistory.length === 0) {
    box.innerHTML = `
      <div class="coach-welcome">
        <div class="coach-avatar">🤖</div>
        <h3>Hi! I'm your FitAI Coach.</h3>
        <p>Ask me anything about workouts, nutrition, recovery, or reaching your fitness goals.</p>
        <div class="coach-suggestions">
          <button class="chat-suggestion" data-chat-question="What workout should I do today?">🏋️ Today's workout</button>
          <button class="chat-suggestion" data-chat-question="What exercises should I do for chest?">💪 Chest exercises</button>
          <button class="chat-suggestion" data-chat-question="What should I eat after my workout?">🍗 Post-workout meal</button>
          <button class="chat-suggestion" data-chat-question="How can I stay consistent with my gym routine?">🔥 Stay consistent</button>
        </div>
      </div>`;
  } else {
    box.innerHTML = State.data.chatHistory.map((m) => `
      <div class="chat-msg ${m.role}">
        ${m.role === "model" ? markdownToHtml(m.text) : `<p>${escapeHtml(m.text)}</p>`}
      </div>`).join("");
  }

  box.scrollTop = box.scrollHeight;
  box.querySelectorAll(".chat-suggestion").forEach((btn) => {
    btn.addEventListener("click", () => sendCoachMessage(btn.dataset.chatQuestion));
  });
}

export function chatContextSummary() {
  const { plan, workoutLog, weightLog, foodLog } = State.data;
  const bits = [];

  if (plan) {
    bits.push(`Current plan: ${plan.overview || "Standard routine"}`);
    if (plan.nutrition) {
      bits.push(`Daily targets: ${plan.nutrition.dailyCalories} kcal, ${plan.nutrition.proteinG}g protein.`);
    }
  }

  bits.push(`Workouts logged: ${workoutLog.length}. Streak: ${computeWorkoutStreak(workoutLog)} day(s).`);

  if (weightLog.length) {
    const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    bits.push(`Latest weight: ${latest.weight}kg on ${latest.date}.`);
  }

  const todayFoods = foodLog.filter((f) => f.date === todayStr());
  if (todayFoods.length) {
    const cals = sum(todayFoods, (f) => f.calories);
    bits.push(`Food today: ${todayFoods.length} items (${cals} kcal).`);
  }

  return bits.join(" ");
}

export async function sendCoachMessage(message) {
  const text = String(message || "").trim();
  if (!text) return;

  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  if (sendBtn && sendBtn.disabled) return;

  if (input) input.value = "";
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "..."; }

  State.data.chatHistory.push({ role: "user", text });
  State.save();
  renderChat();

  const box = document.getElementById("chat-messages");
  const thinking = document.createElement("div");
  thinking.className = "chat-msg model thinking";
  thinking.innerHTML = `<p><span class="dot-flashing"></span></p>`;
  if (box) { box.appendChild(thinking); box.scrollTop = box.scrollHeight; }

  try {
    const reply = await generateChatReply(
      State.data.chatHistory,
      buildChatSystemInstruction(State.data.profile, chatContextSummary())
    );
    State.data.chatHistory.push({ role: "model", text: reply });
    State.save();
  } catch (err) {
    State.data.chatHistory.push({ role: "model", text: `⚠️ **Error:** ${err.message}` });
    State.save();
  } finally {
    renderChat();
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
    if (input) input.focus();
  }
}

export function initChatModule() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  if (!form || !input) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    await sendCoachMessage(text);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const sendBtn = document.getElementById("chat-send");
      if (sendBtn && !sendBtn.disabled) form.requestSubmit();
    }
  });
}

/* =========================================================
   WORKOUTS MODULE
   ========================================================= */

export function getTodayPlanDay() {
  const plan = State.data.plan;
  if (!plan || !Array.isArray(plan.days) || !plan.days.length) return null;
  const idx = State.data.workoutLog.length % plan.days.length;
  return plan.days[idx];
}

export function renderWorkouts() {
  const hasPlan = !!State.data.plan;
  document.getElementById("workouts-empty")?.classList.toggle("hidden", hasPlan);
  document.getElementById("workouts-content")?.classList.toggle("hidden", !hasPlan);
  if (!hasPlan) return;

  const day = getTodayPlanDay();
  const card = document.getElementById("today-workout-card");
  if (card && day) {
    card.innerHTML = `
      <div class="workout-header">
        <div>
          <div class="workout-day-tag">${escapeHtml(day.day)}</div>
          <h3 style="margin:4px 0 0">${escapeHtml(day.focus)}</h3>
        </div>
        <button class="btn-accent" id="btn-log-workout">Log workout</button>
      </div>
      <div id="today-exercise-list" class="exercise-checklist">
        ${(day.exercises || []).map((ex, i) => `
          <label class="exercise-check-row">
            <input type="checkbox" id="ex-${i}" data-idx="${i}">
            <div class="ex-info">
              <span class="ex-name">${escapeHtml(ex.name)}</span>
              <span class="ex-sets">${escapeHtml(String(ex.sets))} sets × ${escapeHtml(String(ex.reps))}</span>
            </div>
          </label>`).join("")}
      </div>`;
    document.getElementById("btn-log-workout")?.addEventListener("click", () => handleLogWorkout(day));
  }

  renderWorkoutHistory();
}

export function handleLogWorkout(day) {
  const checks = document.querySelectorAll('#today-exercise-list input[type="checkbox"]');
  const exercises = (day.exercises || []).map((ex, i) => ({
    name: ex.name, sets: ex.sets, reps: ex.reps, completed: checks[i]?.checked || false,
  }));

  State.data.workoutLog.push({ id: uid(), date: todayStr(), dayLabel: day.day, focus: day.focus, exercises });
  State.save();
  checkAchievements();
  showToast("💪 Workout logged!");
  renderWorkouts();
}

export function renderWorkoutHistory() {
  const list = document.getElementById("workout-history");
  if (!list) return;

  const entries = [...State.data.workoutLog].reverse();
  if (!entries.length) { list.innerHTML = `<p class="placeholder">No workouts logged yet.</p>`; return; }

  list.innerHTML = entries.map((w) => {
    const done = w.exercises.filter((e) => e.completed).length;
    const pct = Math.round((done / w.exercises.length) * 100);
    return `<div class="log-item">
      <div class="log-item-main">
        <div class="title">${escapeHtml(w.date)} — ${escapeHtml(w.dayLabel)}: ${escapeHtml(w.focus)}</div>
        <div class="meta">${done}/${w.exercises.length} exercises · ${pct}% completed</div>
      </div>
      <button class="small-btn danger" data-del-workout="${w.id}">Delete</button>
    </div>`;
  }).join("");

  list.querySelectorAll("[data-del-workout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.workoutLog = State.data.workoutLog.filter((w) => w.id !== btn.dataset.delWorkout);
      State.save(); renderWorkouts();
    });
  });
}

/* =========================================================
   NUTRITION MODULE
   ========================================================= */

export function computeTodayTotals() {
  const today = todayStr();
  const entries = State.data.foodLog.filter((f) => f.date === today);
  return {
    calories: sum(entries, (e) => e.calories),
    proteinG: sum(entries, (e) => e.proteinG),
    carbsG: sum(entries, (e) => e.carbsG),
    fatG: sum(entries, (e) => e.fatG),
  };
}

export function renderNutrition() {
  const hasPlan = !!(State.data.plan && State.data.plan.nutrition);
  document.getElementById("nutrition-empty")?.classList.toggle("hidden", hasPlan);
  document.getElementById("nutrition-content")?.classList.toggle("hidden", !hasPlan);
  if (!hasPlan) return;

  const target = State.data.plan.nutrition;
  const totals = computeTodayTotals();

  const targetsCard = document.getElementById("nutrition-targets-card");
  if (targetsCard) {
    const pct = (val, t) => Math.min(100, Math.round((val / (t || 1)) * 100));
    targetsCard.innerHTML = `
      <h3>Today vs Target</h3>
      <div class="nutrition-grid">
        <div class="n-item"><div class="n-val">${totals.calories}<span class="n-of">/${target.dailyCalories}</span></div><div class="n-label">Calories</div><div class="n-bar"><div class="n-bar-fill" style="width:${pct(totals.calories, target.dailyCalories)}%"></div></div></div>
        <div class="n-item"><div class="n-val">${totals.proteinG}<span class="n-of">/${target.proteinG}g</span></div><div class="n-label">Protein</div><div class="n-bar"><div class="n-bar-fill" style="width:${pct(totals.proteinG, target.proteinG)}%"></div></div></div>
        <div class="n-item"><div class="n-val">${totals.carbsG}<span class="n-of">/${target.carbsG}g</span></div><div class="n-label">Carbs</div><div class="n-bar"><div class="n-bar-fill" style="width:${pct(totals.carbsG, target.carbsG)}%"></div></div></div>
        <div class="n-item"><div class="n-val">${totals.fatG}<span class="n-of">/${target.fatG}g</span></div><div class="n-label">Fat</div><div class="n-bar"><div class="n-bar-fill" style="width:${pct(totals.fatG, target.fatG)}%"></div></div></div>
      </div>`;
  }

  const mealCard = document.getElementById("meal-ideas-card");
  if (mealCard && Array.isArray(target.mealIdeas)) {
    mealCard.innerHTML = `<h3>Meal Ideas from Your Plan</h3><ul class="plan-list">${target.mealIdeas.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`;
  }

  renderFoodLog();
}

export function renderFoodLog() {
  const today = todayStr();
  const entries = State.data.foodLog.filter((f) => f.date === today).reverse();
  const list = document.getElementById("food-log");
  if (!list) return;

  if (!entries.length) { list.innerHTML = `<p class="placeholder">Nothing logged today yet.</p>`; return; }

  list.innerHTML = entries.map((f) => `
    <div class="log-item">
      <div class="log-item-main">
        <div class="title">${escapeHtml(f.foodName)}</div>
        <div class="meta">${f.calories} kcal &nbsp;·&nbsp; P ${f.proteinG}g &nbsp;·&nbsp; C ${f.carbsG}g &nbsp;·&nbsp; F ${f.fatG}g</div>
      </div>
      <button class="small-btn danger" data-del-food="${f.id}">Delete</button>
    </div>`).join("");

  list.querySelectorAll("[data-del-food]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.foodLog = State.data.foodLog.filter((f) => f.id !== btn.dataset.delFood);
      State.save(); renderNutrition();
    });
  });
}

export function initNutritionModule() {
  const form = document.getElementById("food-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("food-input");
    const desc = input ? input.value.trim() : "";
    if (!desc) return;

    const submitBtn = document.getElementById("food-submit");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Estimating…"; }

    try {
      const est = await generateJSON(buildCalorieEstimatePrompt(desc));
      State.data.foodLog.push({
        id: uid(), date: todayStr(),
        foodName: est.foodName || desc,
        calories: Math.round(Number(est.calories) || 0),
        proteinG: Math.round(Number(est.proteinG) || 0),
        carbsG: Math.round(Number(est.carbsG) || 0),
        fatG: Math.round(Number(est.fatG) || 0),
      });
      State.save(); checkAchievements();
      if (input) input.value = "";
      renderNutrition();
      showToast(`Added: ${est.foodName || desc}`);
    } catch (err) {
      showToast("Couldn't estimate: " + err.message, true);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Estimate & add"; }
    }
  });
}

/* =========================================================
   WEIGHT MODULE
   ========================================================= */

export function renderWeight() {
  const dateInput = document.getElementById("weight-date");
  if (dateInput && !dateInput.value) dateInput.value = todayStr();

  const list = document.getElementById("weight-history");
  if (list) {
    const entries = [...State.data.weightLog].sort((a, b) => b.date.localeCompare(a.date));
    list.innerHTML = entries.length
      ? entries.map((w) => `
          <div class="log-item">
            <div class="log-item-main">
              <div class="title">${escapeHtml(w.date)}</div>
              <div class="meta">${w.weight} kg</div>
            </div>
            <button class="small-btn danger" data-del-weight="${w.id}">Delete</button>
          </div>`).join("")
      : `<p class="placeholder">No entries yet.</p>`;

    list.querySelectorAll("[data-del-weight]").forEach((btn) => {
      btn.addEventListener("click", () => {
        State.data.weightLog = State.data.weightLog.filter((w) => w.id !== btn.dataset.delWeight);
        State.save(); renderWeight();
      });
    });
  }

  renderWeightChart("chart-weight-full");
}

export function renderWeightChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const sorted = [...State.data.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  if (charts[canvasId]) charts[canvasId].destroy();

  charts[canvasId] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: sorted.map((w) => w.date),
      datasets: [{
        label: "Weight (kg)",
        data: sorted.map((w) => w.weight),
        borderColor: "#F2C230",
        backgroundColor: "rgba(242,194,48,0.1)",
        tension: 0.35,
        fill: true,
        pointBackgroundColor: "#F2C230",
        pointBorderColor: "#0e1015",
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#c8c4bc", font: { family: "Inter" } } } },
      scales: {
        x: { ticks: { color: "#7a7e8a" }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { ticks: { color: "#7a7e8a" }, grid: { color: "rgba(255,255,255,0.05)" } },
      },
    },
  });
}

export function initWeightModule() {
  const form = document.getElementById("weight-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const dateInput = document.getElementById("weight-date");
    const valInput = document.getElementById("weight-value");
    const date = (dateInput && dateInput.value) || todayStr();
    const weight = parseFloat(valInput ? valInput.value : 0);
    if (isNaN(weight) || weight <= 0) return;

    State.data.weightLog.push({ id: uid(), date, weight });
    State.save(); checkAchievements();
    if (valInput) valInput.value = "";
    showToast("⚖️ Weight logged.");
    renderWeight();
  });
}

/* =========================================================
   GOALS MODULE
   ========================================================= */

export function renderGoals() {
  const list = document.getElementById("goal-list");
  if (!list) return;

  if (!State.data.goals.length) { list.innerHTML = `<p class="placeholder">No goals yet — add one above.</p>`; return; }

  list.innerHTML = State.data.goals.map((g) => `
    <div class="log-item ${g.done ? "goal-done" : ""}">
      <div class="log-item-main">
        <label style="display:flex;align-items:center;gap:10px;margin:0;cursor:pointer;">
          <input type="checkbox" class="goal-checkbox" data-toggle-goal="${g.id}" ${g.done ? "checked" : ""}>
          <span class="title ${g.done ? "strikethrough" : ""}">${escapeHtml(g.title)}</span>
        </label>
        ${g.target ? `<div class="meta" style="margin-left:30px;">🎯 ${escapeHtml(g.target)}</div>` : ""}
      </div>
      <button class="small-btn danger" data-del-goal="${g.id}">Delete</button>
    </div>`).join("");

  list.querySelectorAll("[data-toggle-goal]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const g = State.data.goals.find((x) => x.id === cb.dataset.toggleGoal);
      if (g) { g.done = cb.checked; State.save(); renderGoals(); }
    });
  });

  list.querySelectorAll("[data-del-goal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.goals = State.data.goals.filter((g) => g.id !== btn.dataset.delGoal);
      State.save(); renderGoals();
    });
  });
}

export function initGoalsModule() {
  const form = document.getElementById("goal-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("goal-title");
    const targetInput = document.getElementById("goal-target");
    const title = titleInput ? titleInput.value.trim() : "";
    const target = targetInput ? targetInput.value.trim() : "";
    if (!title) return;

    State.data.goals.push({ id: uid(), title, target, done: false });
    State.save();
    if (titleInput) titleInput.value = "";
    if (targetInput) targetInput.value = "";
    renderGoals();
    showToast("Goal added!");
  });
}

/* =========================================================
   REMINDERS MODULE
   ========================================================= */

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function renderReminders() {
  const today = new Date().getDay();
  const todayStamp = todayStr();

  const todayList = document.getElementById("reminders-today");
  if (todayList) {
    const dueToday = State.data.reminders.filter((r) => r.days.includes(today));
    todayList.innerHTML = dueToday.length
      ? dueToday.map((r) => {
          const done = r.lastDoneDate === todayStamp;
          return `<div class="log-item ${done ? "reminder-done" : ""}">
            <div class="log-item-main">
              <div class="title">${escapeHtml(r.text)}</div>
              <div class="meta">⏰ ${escapeHtml(r.time)}${done ? " · ✓ completed" : ""}</div>
            </div>
            ${done ? "" : `<button class="small-btn" data-done-reminder="${r.id}">Done</button>`}
          </div>`;
        }).join("")
      : `<p class="placeholder">Nothing scheduled today.</p>`;

    todayList.querySelectorAll("[data-done-reminder]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = State.data.reminders.find((x) => x.id === btn.dataset.doneReminder);
        if (r) { r.lastDoneDate = todayStamp; State.save(); renderReminders(); }
      });
    });
  }

  const allList = document.getElementById("reminders-all");
  if (allList) {
    allList.innerHTML = State.data.reminders.length
      ? State.data.reminders.map((r) => `
          <div class="log-item">
            <div class="log-item-main">
              <div class="title">${escapeHtml(r.text)}</div>
              <div class="meta">⏰ ${escapeHtml(r.time)} · ${r.days.map((d) => WEEKDAY_NAMES[d]).join(", ")}</div>
            </div>
            <button class="small-btn danger" data-del-reminder="${r.id}">Delete</button>
          </div>`).join("")
      : `<p class="placeholder">No reminders set.</p>`;

    allList.querySelectorAll("[data-del-reminder]").forEach((btn) => {
      btn.addEventListener("click", () => {
        State.data.reminders = State.data.reminders.filter((r) => r.id !== btn.dataset.delReminder);
        State.save(); renderReminders();
      });
    });
  }
}

export function initRemindersModule() {
  const form = document.getElementById("reminder-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = document.getElementById("reminder-text")?.value.trim() || "";
    const time = document.getElementById("reminder-time")?.value || "";
    const days = [...document.querySelectorAll("#reminder-days input:checked")].map((cb) => parseInt(cb.value, 10));

    if (!text || !time || !days.length) { showToast("Pick at least one day.", true); return; }

    State.data.reminders.push({ id: uid(), text, time, days, lastDoneDate: null });
    State.save();
    form.reset();
    renderReminders();
    showToast("Reminder set!");
  });
}

export function checkDueReminders() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const now = new Date();
  const hhmm = now.toTimeString().slice(0, 5);
  const today = now.getDay();
  const todayStamp = todayStr();

  State.data.reminders.forEach((r) => {
    if (!r.days.includes(today) || r.time !== hhmm || r.lastDoneDate === todayStamp) return;
    const notifiedKey = `${r.id}_${todayStamp}`;
    if (State.data.meta.remindersNotifiedToday[notifiedKey]) return;
    new Notification("FitAI reminder", { body: r.text });
    State.data.meta.remindersNotifiedToday[notifiedKey] = true;
    State.save();
  });
}

/* =========================================================
   DASHBOARD MODULE
   ========================================================= */

function getWeekRange(offsetWeeks) {
  const start = new Date();
  const day = start.getDay();
  start.setDate(start.getDate() - day - offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: dateStr(start), end: dateStr(end) };
}

export function renderDashboard() {
  const hasProfile = !!State.data.profile;
  document.getElementById("dashboard-empty")?.classList.toggle("hidden", hasProfile);
  document.getElementById("dashboard-content")?.classList.toggle("hidden", !hasProfile);
  if (!hasProfile) return;

  const { profile, plan, weightLog, workoutLog, foodLog } = State.data;
  const sortedWeights = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const currentWeight = sortedWeights.length ? sortedWeights[sortedWeights.length - 1].weight : profile.weight;

  let goalProgressText = "No target set";
  if (profile.targetWeight) {
    const startWeight = sortedWeights.length ? sortedWeights[0].weight : profile.weight;
    const delta = (currentWeight - startWeight).toFixed(1);
    const remaining = (profile.targetWeight - currentWeight).toFixed(1);
    goalProgressText = `${delta > 0 ? "+" : ""}${delta} kg · ${remaining} kg to goal`;
  }

  const weekTarget = plan && plan.days ? plan.days.length : 0;
  const weekCount = workoutLog.filter((w) => isInCurrentWeek(w.date)).length;
  const todayTotals = computeTodayTotals();
  const calTarget = plan?.nutrition?.dailyCalories || null;
  const streak = computeWorkoutStreak(workoutLog);

  const statGrid = document.getElementById("stat-grid");
  if (statGrid) {
    statGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon">⚖️</div>
        <div class="label">Current Weight</div>
        <div class="value">${currentWeight} <span class="value-unit">kg</span></div>
        <div class="sub">${escapeHtml(goalProgressText)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🏋️</div>
        <div class="label">Workouts This Week</div>
        <div class="value">${weekCount}<span class="value-unit">/${weekTarget || "—"}</span></div>
        <div class="sub">${streak} day streak</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🔥</div>
        <div class="label">Calories Today</div>
        <div class="value">${todayTotals.calories}<span class="value-unit">${calTarget ? "/" + calTarget : " kcal"}</span></div>
        <div class="sub">${foodLog.filter((f) => f.date === todayStr()).length} items logged</div>
      </div>`;
  }

  renderWeightChart("chart-weight");

  const workoutsCanvas = document.getElementById("chart-workouts");
  if (workoutsCanvas) {
    const labels = [], data = [];
    for (let i = 3; i >= 0; i--) {
      const { start, end } = getWeekRange(i);
      labels.push(i === 0 ? "This wk" : `${i}w ago`);
      data.push(workoutLog.filter((w) => w.date >= start && w.date <= end).length);
    }
    if (charts["chart-workouts"]) charts["chart-workouts"].destroy();
    charts["chart-workouts"] = new Chart(workoutsCanvas.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Workouts", data, backgroundColor: "#F2C230", borderRadius: 8, borderSkipped: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#7a7e8a" }, grid: { display: false } },
          y: { ticks: { color: "#7a7e8a", stepSize: 1 }, grid: { color: "rgba(255,255,255,0.05)" } },
        },
      },
    });
  }

  renderBadges();
}

export function renderBadges() {
  const list = document.getElementById("badge-list");
  if (!list) return;
  const unlockedIds = new Set(State.data.achievements.map((a) => a.id));
  list.innerHTML = ACHIEVEMENT_DEFS.map((def) => {
    const unlocked = unlockedIds.has(def.id);
    return `<div class="badge ${unlocked ? "unlocked" : ""}" title="${escapeHtml(def.desc)}">${unlocked ? "✓ " : ""}${escapeHtml(def.title)}</div>`;
  }).join("");
}

/* =========================================================
   ACHIEVEMENTS
   ========================================================= */

export const ACHIEVEMENT_DEFS = [
  { id: "profile_created", title: "Getting Started", desc: "Create your profile", check: (s) => !!s.profile },
  { id: "first_plan", title: "Blueprint Ready", desc: "Generate your first plan", check: (s) => !!s.plan },
  { id: "first_workout", title: "First Rep", desc: "Log your first workout", check: (s) => s.workoutLog.length >= 1 },
  { id: "five_workouts", title: "Consistent", desc: "Log 5 workouts", check: (s) => s.workoutLog.length >= 5 },
  { id: "week_streak", title: "Iron Habit", desc: "7-day workout streak", check: (s) => computeWorkoutStreak(s.workoutLog) >= 7 },
  { id: "first_weigh_in", title: "Weigh In", desc: "Log your first weight entry", check: (s) => s.weightLog.length >= 1 },
  {
    id: "progress_made", title: "Progress Made", desc: "Move 1kg toward your target",
    check: (s) => {
      if (!s.profile?.targetWeight || s.weightLog.length < 2) return false;
      const sorted = [...s.weightLog].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0].weight, last = sorted[sorted.length - 1].weight;
      return (s.profile.targetWeight - first) * (last - first) > 0 && Math.abs(last - first) >= 1;
    },
  },
  { id: "fed_right", title: "Fed Right", desc: "Log 5 food entries", check: (s) => s.foodLog.length >= 5 },
  { id: "adaptive_athlete", title: "Adaptive Athlete", desc: "Adapt your plan based on progress", check: (s) => !!s.meta.lastAdaptedAt },
];

export function checkAchievements() {
  const unlockedIds = new Set(State.data.achievements.map((a) => a.id));
  let changed = false;
  ACHIEVEMENT_DEFS.forEach((def) => {
    if (!unlockedIds.has(def.id) && def.check(State.data)) {
      State.data.achievements.push({ id: def.id, title: def.title, unlockedAt: new Date().toISOString() });
      showToast(`🏆 Achievement: ${def.title}`);
      changed = true;
    }
  });
  if (changed) State.save();
}

/* =========================================================
   INIT ALL MODULES
   ========================================================= */

export function initAllModules() {
  initNav();
  initProfileModule();
  initPlanModule();
  initChatModule();
  initNutritionModule();
  initWeightModule();
  initGoalsModule();
  initRemindersModule();
}
