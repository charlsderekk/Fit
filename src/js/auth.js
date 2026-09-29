/* =========================================================
   FitAI — Local Account Management
   Handles local state reset and initialization.
   ========================================================= */

import { State } from "./storage.js";

export const LOCAL_ACCOUNT_KEY = "local";

export function resetLocalData() {
  const sure = confirm(
    "This will erase all your FitAI data on this device and reset to a fresh start. Continue?"
  );
  if (!sure) return;
  State.reset();
  location.reload();
}

export function initAuthModule() {
  const resetBtn = document.getElementById("btn-logout");
  if (!resetBtn) return;
  resetBtn.textContent = "Reset my data";
  resetBtn.addEventListener("click", resetLocalData);
}
