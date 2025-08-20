/* ============================================================
   Theme Switcher Script
   ------------------------------------------------------------
   Responsibilities:
   - Cycle through available themes on logo click
   - Remember selected theme in localStorage
   - Load saved theme on startup
   ============================================================ */

/* ---------- DOM References ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const themeLink = document.getElementById("themeStylesheet");
  const logo = document.getElementById("logo");

  /* ---------- Config ---------- */
  const themes = ["/css/glass.css","/css/grey.css", "/css/peach.css", "/css/blue.css"]; // available themes
  let currentIndex = 0;

  /* ---------- Event: Logo Click ---------- */
  // clicking the logo cycles theme + saves it
  logo.addEventListener("click", () => {
    currentIndex = (currentIndex + 1) % themes.length;
    themeLink.href = themes[currentIndex];
    localStorage.setItem("selectedTheme", themes[currentIndex]);
  });

  /* ---------- Load Saved Theme ---------- */
  const savedTheme = localStorage.getItem("selectedTheme");
  if (savedTheme && themes.includes(savedTheme)) {
    themeLink.href = savedTheme;
    currentIndex = themes.indexOf(savedTheme);
  }
});
