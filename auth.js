/* =========================================================
   FitAI — local account.

   Signup/login screens have been removed. The app now goes
   straight in and uses one fixed local "account" — all data
   just lives under one key in this browser's localStorage.
   There's no server and no real user separation anymore, so
   there's nothing to sign up or log in to.

   This file now only exposes a "reset my data" action, wired
   up to whatever element has id="btn-logout" (if your HTML
   still has that button somewhere, e.g. in a settings menu) —
   handy for testers who want to wipe local data and start over.
   If you don't need that, you can delete this file and the
   <script> tag that loads it, and remove the call to
   initAuthModule() in main.js.
   ========================================================= */

const LOCAL_ACCOUNT_KEY = "local";

function resetLocalData() {
  const sure = confirm(
    "This will erase all your FitAI data on this device. Continue?"
  );
  if (!sure) return;
  State.reset();
  location.reload();
}

function initAuthModule() {
  const resetBtn = document.getElementById("btn-logout");
  if (!resetBtn) return; // fine if your HTML doesn't have this button
  resetBtn.textContent = "Reset my data";
  resetBtn.addEventListener("click", resetLocalData);
}
