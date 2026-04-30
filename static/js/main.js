// ── Theme toggle ──────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
updateThemeIcon(savedTheme);

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon");
  if (!icon) return;
  icon.className = theme === "dark" ? "fas fa-moon" : "fas fa-sun";
}

// ── Toast notifications ───────────────────────────────────────────────────
function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : "triangle-exclamation"}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

// ── Animated counters ─────────────────────────────────────────────────────
function animateCount(el, target) {
  const duration = 1200;
  const start = performance.now();
  const from = 0;

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

document.querySelectorAll("[data-count]").forEach(el => {
  const target = parseInt(el.getAttribute("data-count"), 10);
  setTimeout(() => animateCount(el, target), 300);
});

// ── Toast auto-dismiss ────────────────────────────────────────────────────
document.querySelectorAll(".toast").forEach(t => {
  setTimeout(() => t.remove(), 4200);
});

// ── Page entrance animations ──────────────────────────────────────────────
document.querySelectorAll(".stat-card, .chart-card, .table-card, .glass").forEach((el, i) => {
  el.style.opacity = "0";
  el.style.transform = "translateY(16px)";
  setTimeout(() => {
    el.style.transition = "opacity 0.45s ease, transform 0.45s ease";
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  }, 80 + i * 55);
});
