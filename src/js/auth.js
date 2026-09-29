/* =========================================================
   FitAI — Local Account Management
   Handles local state reset and initialization.
   ========================================================= */

import { State } from "./storage.js";

export const LOCAL_ACCOUNT_KEY = "local";

export function resetLocalData() {
  const dialog = document.getElementById("reset-dialog");
  if (!(dialog instanceof HTMLDialogElement)) return;
  dialog.showModal();
}

function confirmResetLocalData() {
  State.reset();
  location.reload();
}

export function initAuthModule() {
  const resetBtn = document.getElementById("btn-logout");
  if (!resetBtn) return;
  resetBtn.textContent = "Reset my data";
  resetBtn.addEventListener("click", resetLocalData);

  const dialog = document.getElementById("reset-dialog");
  const cancelBtn = document.getElementById("btn-cancel-reset");
  const confirmBtn = document.getElementById("btn-confirm-reset");
  if (!(dialog instanceof HTMLDialogElement) || !cancelBtn || !confirmBtn) return;

  cancelBtn.addEventListener("click", () => dialog.close());
  confirmBtn.addEventListener("click", confirmResetLocalData);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}
