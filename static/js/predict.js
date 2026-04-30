let currentPredId = null;
let allResults   = [];
let emotionChart = null;

// ── Drop zone setup ───────────────────────────────────────────────────────
const dropZone  = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

dropZone.addEventListener("click", e => {
  if (!e.target.closest(".btn-icon")) fileInput.click();
});

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) setFile(file);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(file) {
  if (!file.name.endsWith(".csv")) {
    showToast("Only CSV files are accepted", "error");
    return;
  }
  document.getElementById("uploadPreview").style.display = "flex";
  document.querySelector(".upload-inner").style.display = "none";
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("fileSize").textContent = formatSize(file.size);
  document.getElementById("predictBtn").disabled = false;
  dropZone._file = file;
}

function clearFile() {
  document.getElementById("uploadPreview").style.display = "none";
  document.querySelector(".upload-inner").style.display = "flex";
  document.getElementById("predictBtn").disabled = true;
  fileInput.value = "";
  dropZone._file = null;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// ── Prediction run ────────────────────────────────────────────────────────
const typingMessages = [
  "Initializing NexusAI engine...",
  "Extracting semantic embeddings...",
  "Analyzing emotional patterns...",
  "Computing risk scores...",
  "Classifying delay probability...",
  "Finalizing predictions...",
];

async function runPrediction() {
  const file = dropZone._file;
  if (!file) return;

  showLoader();
  let msgIdx = 0;
  const typingEl = document.getElementById("typingText");
  const typer = setInterval(() => {
    typingEl.textContent = typingMessages[msgIdx % typingMessages.length];
    msgIdx++;
  }, 900);

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("/api/predict", { method: "POST", body: formData });
    const data = await res.json();
    clearInterval(typer);
    hideLoader();

    if (data.success) {
      currentPredId = data.pred_id;
      allResults    = data.results;
      showResults(data);
    } else {
      showToast(data.error || "Prediction failed", "error");
    }
  } catch (e) {
    clearInterval(typer);
    hideLoader();
    showToast("Network error — is the server running?", "error");
  }
}

function showLoader() {
  document.getElementById("loadingOverlay").style.display = "flex";
}

function hideLoader() {
  document.getElementById("loadingOverlay").style.display = "none";
}

function showResults(data) {
  document.getElementById("uploadSection").style.display = "none";
  const rs = document.getElementById("resultsSection");
  rs.style.display = "block";
  rs.classList.add("fade-in");

  // Summary stats
  animateCountEl("r-total",   data.total);
  animateCountEl("r-delayed", data.delayed);
  animateCountEl("r-ontime",  data.on_time);
  document.getElementById("r-risk").textContent = data.avg_risk + "%";

  // Gauge
  drawGauge(data.avg_risk);

  // Emotion chart
  buildEmotionChart(data.results);

  // Table
  renderTable(data.results);
}

function animateCountEl(id, target) {
  const el = document.getElementById(id);
  let n = 0;
  const step = Math.ceil(target / 30);
  const iv = setInterval(() => {
    n = Math.min(n + step, target);
    el.textContent = n;
    if (n >= target) clearInterval(iv);
  }, 30);
}

// ── Gauge (speedometer) ───────────────────────────────────────────────────
function drawGauge(pct) {
  const canvas = document.getElementById("gaugeCanvas");
  const ctx    = canvas.getContext("2d");
  const cx = 140, cy = 140, r = 110;
  const startAngle = Math.PI;
  const endAngle   = 2 * Math.PI;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // BG arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.lineWidth = 18;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineCap = "round";
  ctx.stroke();

  // Color arcs
  const segments = [
    { pct: 0.33, color: "#00ffa3" },
    { pct: 0.33, color: "#ffd93d" },
    { pct: 0.34, color: "#ff4b4b" },
  ];
  let cursor = startAngle;
  for (const seg of segments) {
    const span = seg.pct * Math.PI;
    ctx.beginPath();
    ctx.arc(cx, cy, r, cursor, cursor + span);
    ctx.lineWidth = 18;
    ctx.strokeStyle = seg.color;
    ctx.stroke();
    cursor += span;
  }

  // Needle
  const angle = startAngle + (pct / 100) * Math.PI;
  const nx = cx + (r - 18) * Math.cos(angle);
  const ny = cy + (r - 18) * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(nx, ny);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  // Animate value
  const valEl = document.getElementById("gaugeValue");
  let n = 0;
  const target = pct;
  const iv = setInterval(() => {
    n = Math.min(n + 1, target);
    valEl.textContent = n.toFixed(1) + "%";
    if (n >= target) clearInterval(iv);
  }, 25);
}

// ── Emotion chart ─────────────────────────────────────────────────────────
function buildEmotionChart(results) {
  const counts = {};
  for (const r of results) {
    counts[r.emotion] = (counts[r.emotion] || 0) + 1;
  }
  const labels = Object.keys(counts);
  const vals   = Object.values(counts);
  const palette = ["#00d4ff","#00ffa3","#a855f7","#ff4b4b","#ffd93d","#3b82f6","#f97316"];

  if (emotionChart) emotionChart.destroy();
  emotionChart = new Chart(document.getElementById("emotionChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: vals,
        backgroundColor: palette.slice(0, labels.length).map(c => c + "55"),
        borderColor: palette.slice(0, labels.length),
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "rgba(255,255,255,0.5)", font: { family: "Space Grotesk" } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "rgba(255,255,255,0.5)" }, grid: { color: "rgba(255,255,255,0.04)" } }
      },
      animation: { duration: 900, easing: "easeInOutQuart" }
    }
  });
}

// ── Results table ─────────────────────────────────────────────────────────
function renderTable(results) {
  const tbody = document.getElementById("resultsBody");
  tbody.innerHTML = "";
  for (const r of results) {
    const isDelayed = r.prediction === "Delayed";
    const riskColor = r.risk_score > 60 ? "var(--red)" : r.risk_score > 30 ? "var(--yellow)" : "var(--green)";
    const row = document.createElement("tr");
    row.className = "table-row";
    row.dataset.pred = r.prediction;
    row.innerHTML = `
      <td class="mono">${r.id}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(r.chat_preview)}">${escHtml(r.chat_preview)}</td>
      <td><span class="badge ${isDelayed ? "badge-red" : "badge-green"}">${r.prediction}</span></td>
      <td>
        <div class="mini-risk">
          <div class="mini-bar"><div class="mini-fill" style="width:${r.risk_score}%;background:${riskColor}"></div></div>
          <span class="mono">${r.risk_score}%</span>
        </div>
      </td>
      <td><span class="mono">${r.confidence}%</span></td>
      <td><span class="badge badge-purple">${r.emotion}</span></td>
    `;
    tbody.appendChild(row);
  }
}

function filterTable(pred, btn) {
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll("#resultsBody tr").forEach(row => {
    row.style.display = (pred === "all" || row.dataset.pred === pred) ? "" : "none";
  });
}

function resetPrediction() {
  document.getElementById("resultsSection").style.display = "none";
  document.getElementById("uploadSection").style.display = "block";
  clearFile();
  currentPredId = null;
  allResults    = [];
}

function downloadReport() {
  if (!currentPredId) return;
  window.location.href = `/api/download/${currentPredId}`;
}

function escHtml(str) {
  return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
