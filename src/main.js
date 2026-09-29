/* =========================================================
   FitAI — Main Application Entry Point
   ========================================================= */

import "./css/style.css";
import { State } from "./js/storage.js";
import { initAuthModule, LOCAL_ACCOUNT_KEY } from "./js/auth.js";
import {
  initAllModules,
  checkAchievements,
  setActiveView,
  checkDueReminders,
} from "./js/ui.js";

document.addEventListener("DOMContentLoaded", () => {
  initAuthModule();
  startApp();
});

function startApp() {
  State.load(LOCAL_ACCOUNT_KEY);
  initAllModules();
  checkAchievements();

  const appShell = document.getElementById("app-shell");
  if (appShell) appShell.classList.remove("hidden");

  setActiveView(State.data.profile ? "dashboard" : "profile");

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }

  checkDueReminders();
  setInterval(checkDueReminders, 60000);
}
