document.addEventListener("DOMContentLoaded", () => {
  initAuthModule();
  startApp();
});

/* No login/signup anymore — go straight into the app using one
   fixed local account (see LOCAL_ACCOUNT_KEY in auth.js). */
function startApp() {
  State.load(LOCAL_ACCOUNT_KEY);
  initAllModules();
  checkAchievements();

  const authScreen = document.getElementById("auth-screen");
  if (authScreen) authScreen.classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");

  const userLabel = document.getElementById("current-user-label");
  if (userLabel) userLabel.textContent = "FitAI";

  setActiveView(State.data.profile ? "dashboard" : "profile");

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission();
  }
  checkDueReminders();
  setInterval(checkDueReminders, 60000);
}
