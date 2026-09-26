/* =========================================================
   FitAI — UI layer. Organized by feature module. Each module
   has a render() function called when its tab is opened, plus
   handlers wired once during init.
   ========================================================= */

const charts = {};

/* ---------------- small shared helpers ---------------- */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function showToast(message) {
  const stack = document.getElementById("toast-stack");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* Minimal Markdown -> HTML for free-text AI replies (chat only). */
function markdownToHtml(md) {
  const escaped = escapeHtml(md);
  const lines = escaped.split("\n");
  let html = "";
  let inList = null;
  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    const heading = line.match(/^#{1,4}\s+(.*)/);
    if (heading) { closeList(); html += `<p><strong>${inlineFmt(heading[1])}</strong></p>`; continue; }
    const bullet = line.match(/^[-*]\s+(.*)/);
    if (bullet) { if (inList !== "ul") { closeList(); html += "<ul>"; inList = "ul"; } html += `<li>${inlineFmt(bullet[1])}</li>`; continue; }
    const numbered = line.match(/^\d+[.)]\s+(.*)/);
    if (numbered) { if (inList !== "ol") { closeList(); html += "<ol>"; inList = "ol"; } html += `<li>${inlineFmt(numbered[1])}</li>`; continue; }
    closeList();
    html += `<p>${inlineFmt(line)}</p>`;
  }
  closeList();
  return html;
}
function inlineFmt(t) { return t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); }

/* ---------------- navigation ---------------- */

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

function setActiveView(name) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  if (RENDERERS[name]) RENDERERS[name]();
}

function initNav() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.view));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveView(btn.dataset.goto));
  });
}

/* =========================================================
   PROFILE
   ========================================================= */

function renderProfileForm() {
  const p = State.data.profile;
  const submitBtn = document.getElementById("profile-submit");
  if (p) {
    document.getElementById("p-age").value = p.age;
    document.getElementById("p-sex").value = p.sex;
    document.getElementById("p-height").value = p.height;
    document.getElementById("p-weight").value = p.weight;
    document.getElementById("p-target-weight").value = p.targetWeight || "";
    document.getElementById("p-goal").value = p.goal;
    document.getElementById("p-experience").value = p.experience;
    document.getElementById("p-days").value = p.days;
    document.getElementById("p-equipment").value = p.equipment;
    document.getElementById("p-diet").value = p.diet || "No restrictions";
    document.getElementById("p-limitations").value = p.limitations || "";
    submitBtn.textContent = "Save changes";
  } else {
    submitBtn.textContent = "Save profile & generate plan";
  }
}

function initProfileModule() {
  document.getElementById("profile-form").addEventListener("submit", async (e) => {
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
   PLAN (AI feature #1 + #2: generation & adaptive re-planning)
   ========================================================= */

function canAdaptPlan() {
  return State.data.weightLog.length >= 2 || State.data.workoutLog.length >= 3;
}

function buildProgressSummaryText() {
  const { weightLog, workoutLog, profile } = State.data;
  const lines = [];

  if (weightLog.length >= 2) {
    const sorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const delta = (last.weight - first.weight).toFixed(1);
    lines.push(`Weight went from ${first.weight} kg (${first.date}) to ${last.weight} kg (${last.date}), a change of ${delta} kg.`);
  } else {
    lines.push("Not enough weight log entries yet to show a trend.");
  }

  const recentWorkouts = workoutLog.filter((w) => w.date >= daysAgo(14));
  const expected = profile.days * 2; // ~2 weeks worth
  lines.push(`Logged ${recentWorkouts.length} workouts in the last 14 days (target pace was about ${expected}).`);
  lines.push(`Current workout streak: ${computeWorkoutStreak(workoutLog)} day(s).`);

  return lines.map((l) => `- ${l}`).join("\n");
}

function renderPlanHTML(plan) {
  let html = "";
  if (plan.whatChanged) {
    html += `<div class="day-block"><h4>What changed</h4><p>${escapeHtml(plan.whatChanged)}</p></div>`;
  }
  html += `<p>${escapeHtml(plan.overview)}</p>`;
  html += `<h3>Weekly split</h3><ul>${plan.weeklySplit.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
  html += `<h3>Day-by-day</h3>`;
  plan.days.forEach((d) => {
    html += `<div class="day-block"><h4>${escapeHtml(d.day)} — ${escapeHtml(d.focus)}</h4><ul>`;
    d.exercises.forEach((ex) => {
      html += `<li>${escapeHtml(ex.name)} — ${escapeHtml(String(ex.sets))} sets × ${escapeHtml(String(ex.reps))}</li>`;
    });
    html += `</ul></div>`;
  });
  const n = plan.nutrition;
  html += `<h3>Daily nutrition targets</h3>`;
  html += `<div class="nutrition-grid">
    <div class="n-item"><div class="n-val">${escapeHtml(String(n.dailyCalories))}</div><div class="n-label">Calories</div></div>
    <div class="n-item"><div class="n-val">${escapeHtml(String(n.proteinG))}g</div><div class="n-label">Protein</div></div>
    <div class="n-item"><div class="n-val">${escapeHtml(String(n.carbsG))}g</div><div class="n-label">Carbs</div></div>
    <div class="n-item"><div class="n-val">${escapeHtml(String(n.fatG))}g</div><div class="n-label">Fat</div></div>
  </div>`;
  html += `<h3>Meal ideas</h3><ul>${n.mealIdeas.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`;
  html += `<h3>Notes</h3><ul>${plan.notes.map((n2) => `<li>${escapeHtml(n2)}</li>`).join("")}</ul>`;
  return html;
}

function renderPlan() {
  const hasProfile = !!State.data.profile;
  document.getElementById("plan-empty").classList.toggle("hidden", hasProfile);
  document.getElementById("plan-content").classList.toggle("hidden", !hasProfile);
  if (!hasProfile) return;

  const plan = State.data.plan;
  document.getElementById("plan-body").innerHTML = plan
    ? renderPlanHTML(plan)
    : `<p class="placeholder">No plan yet. Click "Regenerate plan" to create one.</p>`;

  const adaptBtn = document.getElementById("btn-adapt-plan");
  const eligible = plan && canAdaptPlan();
  adaptBtn.disabled = !eligible;
  document.getElementById("adapt-hint").textContent = !plan
    ? ""
    : eligible
    ? "Ready to adapt based on your logged progress."
    : "Log at least 2 weigh-ins or 3 workouts to unlock adaptive re-planning.";
}

async function generateInitialPlan() {
  document.getElementById("plan-body").innerHTML = `<div class="loading-text">Building your plan and nutrition targets…</div>`;
  try {
    const plan = await generateJSON(buildInitialPlanPrompt(State.data.profile));
    plan.generatedAt = new Date().toISOString();
    State.data.plan = plan;
    State.save();
    checkAchievements();
    renderPlan();
    showToast("Your plan is ready!");
  } catch (err) {
    document.getElementById("plan-body").innerHTML = `<p class="error-box">${escapeHtml(err.message)}</p>`;
  }
}

async function handleAdaptPlan() {
  const btn = document.getElementById("btn-adapt-plan");
  btn.disabled = true;
  const prevHtml = document.getElementById("plan-body").innerHTML;
  document.getElementById("plan-body").innerHTML = `<div class="loading-text">Reviewing your progress and updating your plan…</div>`;
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
    showToast("Plan adapted based on your progress!");
  } catch (err) {
    document.getElementById("plan-body").innerHTML = prevHtml;
    showToast("Couldn't adapt plan: " + err.message);
  } finally {
    renderPlan();
  }
}

function initPlanModule() {
  document.getElementById("btn-generate-plan").addEventListener("click", generateInitialPlan);
  document.getElementById("btn-adapt-plan").addEventListener("click", handleAdaptPlan);
}

/* =========================================================
   CHAT (AI feature #3)
   ========================================================= */

function renderChat() {
  const hasProfile = !!State.data.profile;

  document.getElementById("chat-empty").classList.toggle("hidden", hasProfile);
  document.getElementById("chat-content").classList.toggle("hidden", !hasProfile);

  if (!hasProfile) return;

  const box = document.getElementById("chat-messages");

  if (State.data.chatHistory.length === 0) {
    box.innerHTML = `
      <div class="coach-welcome">
        <h3>👋 Hi! I'm your FitAI Coach.</h3>
        <p>
          Ask me anything about your workouts, exercises,
          nutrition, recovery, or fitness goals.
        </p>

        <div class="coach-suggestions">

          <button
            type="button"
            class="chat-suggestion"
            data-chat-question="What workout should I do today?"
          >
            🏋️ Workout today
          </button>

          <button
            type="button"
            class="chat-suggestion"
            data-chat-question="What exercises should I do for chest?"
          >
            💪 Chest exercises
          </button>

          <button
            type="button"
            class="chat-suggestion"
            data-chat-question="What should I eat after my workout?"
          >
            🍗 Post-workout meal
          </button>

          <button
            type="button"
            class="chat-suggestion"
            data-chat-question="How can I stay consistent with my gym routine?"
          >
            🔥 Stay consistent
          </button>

        </div>
      </div>
    `;
  } else {
    box.innerHTML = State.data.chatHistory
      .map((m) => `
        <div class="chat-msg ${m.role}">
          ${
            m.role === "model"
              ? markdownToHtml(m.text)
              : `<p>${escapeHtml(m.text)}</p>`
          }
        </div>
      `)
      .join("");
  }

  box.scrollTop = box.scrollHeight;

  box.querySelectorAll(".chat-suggestion").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendCoachMessage(btn.dataset.chatQuestion);
    });
  });
}


function chatContextSummary() {
  const { plan, workoutLog, weightLog, foodLog } = State.data;

  const bits = [];

  if (plan) {
    bits.push(`Current plan overview: ${plan.overview}`);

    if (plan.nutrition) {
      bits.push(
        `Daily nutrition target: ${plan.nutrition.dailyCalories} calories, ` +
        `${plan.nutrition.proteinG}g protein, ` +
        `${plan.nutrition.carbsG}g carbs, ` +
        `${plan.nutrition.fatG}g fat.`
      );
    }
  }

  bits.push(
    `Workouts logged so far: ${workoutLog.length}. ` +
    `Current workout streak: ${computeWorkoutStreak(workoutLog)} day(s).`
  );

  if (weightLog.length) {
    const sortedWeights = [...weightLog].sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    const latestWeight = sortedWeights[sortedWeights.length - 1];

    bits.push(
      `Most recent logged weight: ${latestWeight.weight} kg ` +
      `on ${latestWeight.date}.`
    );
  }

  const todayFoods = foodLog.filter((f) => f.date === todayStr());

  if (todayFoods.length) {
    const todayCalories = todayFoods.reduce(
      (total, food) => total + Number(food.calories || 0),
      0
    );

    bits.push(
      `Food logged today: ${todayFoods.length} item(s), ` +
      `approximately ${todayCalories} calories.`
    );
  }

  return bits.join(" ");
}


async function sendCoachMessage(message) {
  const text = String(message || "").trim();

  if (!text) return;

  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");

  if (sendBtn.disabled) return;

  if (input) {
    input.value = "";
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Thinking...";

  State.data.chatHistory.push({
    role: "user",
    text: text,
  });

  State.save();
  renderChat();

  const box = document.getElementById("chat-messages");

  const thinking = document.createElement("div");
  thinking.className = "chat-msg model";
  thinking.id = "coach-thinking";

  thinking.innerHTML = `
    <p>🤖 <strong>FitAI Coach is thinking...</strong></p>
  `;

  box.appendChild(thinking);
  box.scrollTop = box.scrollHeight;

  try {
    const reply = await generateChatReply(
      State.data.chatHistory,
      buildChatSystemInstruction(
        State.data.profile,
        chatContextSummary()
      )
    );

    State.data.chatHistory.push({
      role: "model",
      text: reply,
    });

    State.save();

  } catch (err) {

    State.data.chatHistory.push({
      role: "model",
      text:
        "Sorry, I couldn't answer right now.\n\n" +
        "Please try again in a moment.\n\n" +
        "Error: " +
        err.message,
    });

    State.save();

  } finally {

    renderChat();

    sendBtn.disabled = false;
    sendBtn.textContent = "Send";

    if (input) {
      input.focus();
    }
  }
}


function initChatModule() {
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

      if (!sendBtn.disabled) {
        form.requestSubmit();
      }
    }
  });
}

/* =========================================================
   WORKOUTS
   ========================================================= */

function getTodayPlanDay() {
  const plan = State.data.plan;
  if (!plan || !plan.days.length) return null;
  const idx = State.data.workoutLog.length % plan.days.length;
  return plan.days[idx];
}

function renderWorkouts() {
  const hasPlan = !!State.data.plan;
  document.getElementById("workouts-empty").classList.toggle("hidden", hasPlan);
  document.getElementById("workouts-content").classList.toggle("hidden", !hasPlan);
  if (!hasPlan) return;

  const day = getTodayPlanDay();
  const card = document.getElementById("today-workout-card");
  card.innerHTML = `
    <h3>Next up: ${escapeHtml(day.day)} — ${escapeHtml(day.focus)}</h3>
    <div id="today-exercise-list">
      ${day.exercises
        .map(
          (ex, i) => `
        <div class="exercise-row">
          <input type="checkbox" id="ex-${i}" data-idx="${i}">
          <span class="ex-name">${escapeHtml(ex.name)}</span>
          <span class="ex-meta">${escapeHtml(String(ex.sets))} × ${escapeHtml(String(ex.reps))}</span>
        </div>`
        )
        .join("")}
    </div>
    <button class="btn-accent" id="btn-log-workout" style="margin-top:14px;">Log this workout</button>
  `;
  document.getElementById("btn-log-workout").addEventListener("click", () => handleLogWorkout(day));

  renderWorkoutHistory();
}

function handleLogWorkout(day) {
  const checks = document.querySelectorAll('#today-exercise-list input[type="checkbox"]');
  const exercises = day.exercises.map((ex, i) => ({
    name: ex.name,
    sets: ex.sets,
    reps: ex.reps,
    completed: checks[i]?.checked || false,
  }));
  State.data.workoutLog.push({
    id: uid(),
    date: todayStr(),
    dayLabel: day.day,
    focus: day.focus,
    exercises,
  });
  State.save();
  checkAchievements();
  showToast("Workout logged!");
  renderWorkouts();
}

function renderWorkoutHistory() {
  const list = document.getElementById("workout-history");
  const entries = [...State.data.workoutLog].reverse();
  if (!entries.length) {
    list.innerHTML = `<p class="placeholder">No workouts logged yet.</p>`;
    return;
  }
  list.innerHTML = entries
    .map((w) => {
      const done = w.exercises.filter((e) => e.completed).length;
      return `<div class="log-item">
        <div class="main"><div class="title">${escapeHtml(w.date)} — ${escapeHtml(w.dayLabel)}: ${escapeHtml(w.focus)}</div>
        <div class="meta">${done}/${w.exercises.length} exercises completed</div></div>
        <div class="actions"><button class="small-btn danger" data-del-workout="${w.id}">Delete</button></div>
      </div>`;
    })
    .join("");
  list.querySelectorAll("[data-del-workout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.workoutLog = State.data.workoutLog.filter((w) => w.id !== btn.dataset.delWorkout);
      State.save();
      renderWorkouts();
    });
  });
}

/* =========================================================
   NUTRITION (AI feature #4: calorie/macro estimation)
   ========================================================= */

function computeTodayTotals() {
  const today = todayStr();
  const entries = State.data.foodLog.filter((f) => f.date === today);
  return {
    calories: sum(entries, (e) => e.calories),
    proteinG: sum(entries, (e) => e.proteinG),
    carbsG: sum(entries, (e) => e.carbsG),
    fatG: sum(entries, (e) => e.fatG),
  };
}

function renderNutrition() {
  const hasPlan = !!(State.data.plan && State.data.plan.nutrition);
  document.getElementById("nutrition-empty").classList.toggle("hidden", hasPlan);
  document.getElementById("nutrition-content").classList.toggle("hidden", !hasPlan);
  if (!hasPlan) return;

  const target = State.data.plan.nutrition;
  const totals = computeTodayTotals();
  document.getElementById("nutrition-targets-card").innerHTML = `
    <h3>Today vs target</h3>
    <div class="nutrition-grid">
      <div class="n-item"><div class="n-val">${totals.calories}/${target.dailyCalories}</div><div class="n-label">Calories</div></div>
      <div class="n-item"><div class="n-val">${totals.proteinG}/${target.proteinG}g</div><div class="n-label">Protein</div></div>
      <div class="n-item"><div class="n-val">${totals.carbsG}/${target.carbsG}g</div><div class="n-label">Carbs</div></div>
      <div class="n-item"><div class="n-val">${totals.fatG}/${target.fatG}g</div><div class="n-label">Fat</div></div>
    </div>
  `;

  document.getElementById("meal-ideas-card").innerHTML = `
    <h3>Meal ideas from your plan</h3>
    <ul>${target.mealIdeas.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>
  `;

  renderFoodLog();
}

function renderFoodLog() {
  const today = todayStr();
  const entries = State.data.foodLog.filter((f) => f.date === today).reverse();
  const list = document.getElementById("food-log");
  if (!entries.length) {
    list.innerHTML = `<p class="placeholder">Nothing logged today yet.</p>`;
    return;
  }
  list.innerHTML = entries
    .map(
      (f) => `<div class="log-item">
        <div class="main"><div class="title">${escapeHtml(f.foodName)}</div>
        <div class="meta">${f.calories} kcal · P ${f.proteinG}g · C ${f.carbsG}g · F ${f.fatG}g</div></div>
        <div class="actions"><button class="small-btn danger" data-del-food="${f.id}">Delete</button></div>
      </div>`
    )
    .join("");
  list.querySelectorAll("[data-del-food]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.foodLog = State.data.foodLog.filter((f) => f.id !== btn.dataset.delFood);
      State.save();
      renderNutrition();
    });
  });
}

function initNutritionModule() {
  document.getElementById("food-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("food-input");
    const desc = input.value.trim();
    if (!desc) return;
    const submitBtn = document.getElementById("food-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Estimating…";
    try {
      const est = await generateJSON(buildCalorieEstimatePrompt(desc));
      State.data.foodLog.push({
        id: uid(),
        date: todayStr(),
        foodName: est.foodName,
        calories: Math.round(est.calories),
        proteinG: Math.round(est.proteinG),
        carbsG: Math.round(est.carbsG),
        fatG: Math.round(est.fatG),
      });
      State.save();
      checkAchievements();
      input.value = "";
      renderNutrition();
    } catch (err) {
      showToast("Couldn't estimate that: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Estimate & add";
    }
  });
}

/* =========================================================
   WEIGHT
   ========================================================= */

function renderWeight() {
  const dateInput = document.getElementById("weight-date");
  if (!dateInput.value) dateInput.value = todayStr();

  const list = document.getElementById("weight-history");
  const entries = [...State.data.weightLog].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = entries.length
    ? entries
        .map(
          (w) => `<div class="log-item">
        <div class="main"><div class="title">${escapeHtml(w.date)}</div><div class="meta">${w.weight} kg</div></div>
        <div class="actions"><button class="small-btn danger" data-del-weight="${w.id}">Delete</button></div>
      </div>`
        )
        .join("")
    : `<p class="placeholder">No entries yet.</p>`;
  list.querySelectorAll("[data-del-weight]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.weightLog = State.data.weightLog.filter((w) => w.id !== btn.dataset.delWeight);
      State.save();
      renderWeight();
    });
  });

  renderWeightChart("chart-weight-full");
}

function renderWeightChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  const sorted = [...State.data.weightLog].sort((a, b) => a.date.localeCompare(b.date));
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: sorted.map((w) => w.date),
      datasets: [
        {
          label: "Weight (kg)",
          data: sorted.map((w) => w.weight),
          borderColor: "#F2C230",
          backgroundColor: "rgba(242,194,48,0.15)",
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#EDEAE2" } } },
      scales: {
        x: { ticks: { color: "#9A9C9F" }, grid: { color: "#33363B" } },
        y: { ticks: { color: "#9A9C9F" }, grid: { color: "#33363B" } },
      },
    },
  });
}

function initWeightModule() {
  document.getElementById("weight-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const date = document.getElementById("weight-date").value || todayStr();
    const weight = parseFloat(document.getElementById("weight-value").value);
    State.data.weightLog.push({ id: uid(), date, weight });
    State.save();
    checkAchievements();
    document.getElementById("weight-value").value = "";
    showToast("Weight logged.");
    renderWeight();
  });
}

/* =========================================================
   GOALS
   ========================================================= */

function renderGoals() {
  const list = document.getElementById("goal-list");
  if (!State.data.goals.length) {
    list.innerHTML = `<p class="placeholder">No goals yet — add one above.</p>`;
    return;
  }
  list.innerHTML = State.data.goals
    .map(
      (g) => `<div class="log-item">
        <div class="main">
          <label style="display:flex; align-items:center; gap:8px; margin:0;">
            <input type="checkbox" style="width:auto;" data-toggle-goal="${g.id}" ${g.done ? "checked" : ""}>
            <span class="title" style="${g.done ? "text-decoration:line-through; color:var(--text-muted);" : ""}">${escapeHtml(g.title)}</span>
          </label>
          ${g.target ? `<div class="meta">Target: ${escapeHtml(g.target)}</div>` : ""}
        </div>
        <div class="actions"><button class="small-btn danger" data-del-goal="${g.id}">Delete</button></div>
      </div>`
    )
    .join("");
  list.querySelectorAll("[data-toggle-goal]").forEach((cb) => {
    cb.addEventListener("change", () => {
      const g = State.data.goals.find((x) => x.id === cb.dataset.toggleGoal);
      g.done = cb.checked;
      State.save();
      renderGoals();
    });
  });
  list.querySelectorAll("[data-del-goal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.goals = State.data.goals.filter((g) => g.id !== btn.dataset.delGoal);
      State.save();
      renderGoals();
    });
  });
}

function initGoalsModule() {
  document.getElementById("goal-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const title = document.getElementById("goal-title").value.trim();
    const target = document.getElementById("goal-target").value.trim();
    if (!title) return;
    State.data.goals.push({ id: uid(), title, target, done: false });
    State.save();
    document.getElementById("goal-title").value = "";
    document.getElementById("goal-target").value = "";
    renderGoals();
  });
}

/* =========================================================
   REMINDERS
   ========================================================= */

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function renderReminders() {
  const today = new Date().getDay();
  const todayStamp = todayStr();

  const todayList = document.getElementById("reminders-today");
  const dueToday = State.data.reminders.filter((r) => r.days.includes(today));
  todayList.innerHTML = dueToday.length
    ? dueToday
        .map((r) => {
          const done = r.lastDoneDate === todayStamp;
          return `<div class="log-item">
        <div class="main"><div class="title">${escapeHtml(r.text)}</div><div class="meta">${escapeHtml(r.time)}${done ? " · done today" : ""}</div></div>
        <div class="actions">${done ? "" : `<button class="small-btn" data-done-reminder="${r.id}">Mark done</button>`}</div>
      </div>`;
        })
        .join("")
    : `<p class="placeholder">Nothing scheduled today.</p>`;
  todayList.querySelectorAll("[data-done-reminder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = State.data.reminders.find((x) => x.id === btn.dataset.doneReminder);
      r.lastDoneDate = todayStamp;
      State.save();
      renderReminders();
    });
  });

  const allList = document.getElementById("reminders-all");
  allList.innerHTML = State.data.reminders.length
    ? State.data.reminders
        .map(
          (r) => `<div class="log-item">
        <div class="main"><div class="title">${escapeHtml(r.text)}</div>
        <div class="meta">${escapeHtml(r.time)} · ${r.days.map((d) => WEEKDAY_NAMES[d]).join(", ")}</div></div>
        <div class="actions"><button class="small-btn danger" data-del-reminder="${r.id}">Delete</button></div>
      </div>`
        )
        .join("")
    : `<p class="placeholder">No reminders set.</p>`;
  allList.querySelectorAll("[data-del-reminder]").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.data.reminders = State.data.reminders.filter((r) => r.id !== btn.dataset.delReminder);
      State.save();
      renderReminders();
    });
  });
}

function initRemindersModule() {
  document.getElementById("reminder-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = document.getElementById("reminder-text").value.trim();
    const time = document.getElementById("reminder-time").value;
    const days = [...document.querySelectorAll('#reminder-days input:checked')].map((cb) => parseInt(cb.value, 10));
    if (!text || !time || !days.length) {
      showToast("Pick at least one day for the reminder.");
      return;
    }
    State.data.reminders.push({ id: uid(), text, time, days, lastDoneDate: null });
    State.save();
    document.getElementById("reminder-form").reset();
    renderReminders();
  });
}

/* Called periodically from main.js to fire browser notifications. */
function checkDueReminders() {
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
   DASHBOARD
   ========================================================= */

function getWeekRange(offsetWeeks) {
  const start = new Date();
  const day = start.getDay();
  start.setDate(start.getDate() - day - offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: dateStr(start), end: dateStr(end) };
}

function renderDashboard() {
  const hasProfile = !!State.data.profile;
  document.getElementById("dashboard-empty").classList.toggle("hidden", hasProfile);
  document.getElementById("dashboard-content").classList.toggle("hidden", !hasProfile);
  if (!hasProfile) return;

  const { profile, plan, weightLog, workoutLog, foodLog } = State.data;
  const sortedWeights = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
  const currentWeight = sortedWeights.length ? sortedWeights[sortedWeights.length - 1].weight : profile.weight;

  let goalProgressText = "No target set";
  if (profile.targetWeight) {
    const startWeight = sortedWeights.length ? sortedWeights[0].weight : profile.weight;
    const delta = (currentWeight - startWeight).toFixed(1);
    const remaining = (profile.targetWeight - currentWeight).toFixed(1);
    goalProgressText = `${delta} kg so far · ${remaining} kg to go`;
  }

  const weekTarget = plan ? plan.days.length : 0;
  const weekCount = workoutLog.filter((w) => isInCurrentWeek(w.date)).length;
  const todayTotals = computeTodayTotals();
  const calTarget = plan ? plan.nutrition.dailyCalories : null;
  const streak = computeWorkoutStreak(workoutLog);

  document.getElementById("stat-grid").innerHTML = `
    <div class="stat-card"><div class="label">Current weight</div><div class="value">${currentWeight} kg</div><div class="sub">${escapeHtml(goalProgressText)}</div></div>
    <div class="stat-card"><div class="label">Workouts this week</div><div class="value">${weekCount}/${weekTarget || "—"}</div><div class="sub">${streak}-day streak</div></div>
    <div class="stat-card"><div class="label">Calories today</div><div class="value">${todayTotals.calories}${calTarget ? "/" + calTarget : ""}</div><div class="sub">${foodLog.filter((f) => f.date === todayStr()).length} item(s) logged</div></div>
  `;

  renderWeightChart("chart-weight");

  const workoutsCanvas = document.getElementById("chart-workouts");
  if (workoutsCanvas && typeof Chart !== "undefined") {
    const labels = [], data = [];
    for (let i = 3; i >= 0; i--) {
      const { start, end } = getWeekRange(i);
      labels.push(i === 0 ? "This wk" : `${i}w ago`);
      data.push(workoutLog.filter((w) => w.date >= start && w.date <= end).length);
    }
    if (charts["chart-workouts"]) charts["chart-workouts"].destroy();
    charts["chart-workouts"] = new Chart(workoutsCanvas.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label: "Workouts", data, backgroundColor: "#F2C230" }] },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#9A9C9F" }, grid: { display: false } },
          y: { ticks: { color: "#9A9C9F", stepSize: 1 }, grid: { color: "#33363B" } },
        },
      },
    });
  }

  renderBadges();
}

function renderBadges() {
  const list = document.getElementById("badge-list");
  const unlockedIds = new Set(State.data.achievements.map((a) => a.id));
  list.innerHTML = ACHIEVEMENT_DEFS.map((def) => {
    const unlocked = unlockedIds.has(def.id);
    return `<div class="badge ${unlocked ? "unlocked" : ""}" title="${escapeHtml(def.desc)}">${unlocked ? "✓ " : ""}${escapeHtml(def.title)}</div>`;
  }).join("");
}

/* =========================================================
   ACHIEVEMENTS
   ========================================================= */

const ACHIEVEMENT_DEFS = [
  { id: "profile_created", title: "Getting Started", desc: "Create your profile", check: (s) => !!s.profile },
  { id: "first_plan", title: "Blueprint Ready", desc: "Generate your first plan", check: (s) => !!s.plan },
  { id: "first_workout", title: "First Rep", desc: "Log your first workout", check: (s) => s.workoutLog.length >= 1 },
  { id: "five_workouts", title: "Consistent", desc: "Log 5 workouts", check: (s) => s.workoutLog.length >= 5 },
  { id: "week_streak", title: "Iron Habit", desc: "7-day workout streak", check: (s) => computeWorkoutStreak(s.workoutLog) >= 7 },
  { id: "first_weigh_in", title: "Weigh In", desc: "Log your first weight entry", check: (s) => s.weightLog.length >= 1 },
  {
    id: "progress_made",
    title: "Progress Made",
    desc: "Move at least 1kg toward your target weight",
    check: (s) => {
      if (!s.profile?.targetWeight || s.weightLog.length < 2) return false;
      const sorted = [...s.weightLog].sort((a, b) => a.date.localeCompare(b.date));
      const first = sorted[0].weight, last = sorted[sorted.length - 1].weight;
      const towardGoal = (s.profile.targetWeight - first) * (last - first) > 0;
      return towardGoal && Math.abs(last - first) >= 1;
    },
  },
  { id: "fed_right", title: "Fed Right", desc: "Log 5 food entries", check: (s) => s.foodLog.length >= 5 },
  { id: "adaptive_athlete", title: "Adaptive Athlete", desc: "Adapt your plan based on progress", check: (s) => !!s.meta.lastAdaptedAt },
];

function checkAchievements() {
  const unlockedIds = new Set(State.data.achievements.map((a) => a.id));
  let changed = false;
  ACHIEVEMENT_DEFS.forEach((def) => {
    if (!unlockedIds.has(def.id) && def.check(State.data)) {
      State.data.achievements.push({ id: def.id, title: def.title, unlockedAt: new Date().toISOString() });
      showToast(`Achievement unlocked: ${def.title}`);
      changed = true;
    }
  });
  if (changed) State.save();
}

/* =========================================================
   INIT ALL MODULES (called once from main.js)
   ========================================================= */

function initAllModules() {
  initNav();
  initProfileModule();
  initPlanModule();
  initChatModule();
  initNutritionModule();
  initWeightModule();
  initGoalsModule();
  initRemindersModule();
}
