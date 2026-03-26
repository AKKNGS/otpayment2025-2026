// --- CONFIGURATION ---
const API_URL = "https://script.google.com/macros/s/AKfycbyE-UUo6yu_Fn1SUVYrrwOnvvuCbhmIoq-eW0W7VKh69OeqDZ3BHPKB4QuWWYdt7RyA5g/exec";
let SCHOOL_LOGO_URL = "";
let CURRENT_ROWS = [];
let FILTER_TIMER = null;
let CURRENT_USER = null;

// --- STORAGE / AUTH ---
function saveSession(user) {
  CURRENT_USER = user;
  localStorage.setItem("schoolpro_auth", JSON.stringify(user));
  applyRoleUI();
}

function loadSession() {
  try {
    const raw = localStorage.getItem("schoolpro_auth");
    CURRENT_USER = raw ? JSON.parse(raw) : null;
  } catch (e) {
    CURRENT_USER = null;
  }
  applyRoleUI();
}

function logout() {
  CURRENT_USER = null;
  localStorage.removeItem("schoolpro_auth");
  applyRoleUI();
}

function isAdmin() {
  return CURRENT_USER && CURRENT_USER.role === "admin";
}

function requireAdmin() {
  if (!isAdmin()) {
    alert("គណនី Viewer មិនអាចកែប្រែទិន្នន័យបានទេ");
    return false;
  }
  return true;
}

function applyRoleUI() {
  const loginScreen = document.getElementById("loginScreen");
  const appShell = document.getElementById("appShell");
  const userBadge = document.getElementById("userBadge");
  const roleBadge = document.getElementById("roleBadge");
  const loginInfo = document.getElementById("loginInfo");
  const adminOnly = document.querySelectorAll('[data-role="admin"]');

  if (!CURRENT_USER) {
    if (loginScreen) loginScreen.style.display = "flex";
    if (appShell) appShell.style.display = "none";
    return;
  }

  if (loginScreen) loginScreen.style.display = "none";
  if (appShell) appShell.style.display = "flex";

  if (userBadge) userBadge.textContent = CURRENT_USER.username || "-";
  if (roleBadge) roleBadge.textContent = (CURRENT_USER.role || "").toUpperCase();
  if (loginInfo) loginInfo.textContent = `Logged in as ${CURRENT_USER.username} (${CURRENT_USER.role})`;

  adminOnly.forEach((el) => {
    el.style.display = isAdmin() ? "" : "none";
  });

  if (CURRENT_ROWS.length) renderTable(CURRENT_ROWS);
}

// --- HELPERS ---
function fmt(n) {
  return Number(n || 0).toLocaleString() + " KHR";
}

function esc(t) {
  return String(t ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toFlatParams(obj, prefix = "") {
  const out = {};
  Object.keys(obj || {}).forEach((key) => {
    const value = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === undefined || value === null) {
      out[fullKey] = "";
    } else if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, toFlatParams(value, fullKey));
    } else {
      out[fullKey] = String(value);
    }
  });
  return out;
}

function getFilters() {
  return {
    date: document.getElementById("filterDate")?.value || "",
    month: document.getElementById("filterMonth")?.value || "",
    teacher: document.getElementById("filterTeacher")?.value || "",
    student: document.getElementById("filterStudent")?.value || "",
    search: document.getElementById("searchText")?.value || ""
  };
}

function setTodayDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  if (document.getElementById("paid_date") && !document.getElementById("paid_date").value) {
    document.getElementById("paid_date").value = today;
  }
  if (document.getElementById("report_date") && !document.getElementById("report_date").value) {
    document.getElementById("report_date").value = today;
  }
}

// --- API WRAPPER ---
// Use GET to avoid cross-origin POST issues with Apps Script on Vercel/GitHub Pages.
async function gasCall(action, payload = {}) {
  const params = new URLSearchParams();
  params.set("action", action);

  const flatPayload = toFlatParams(payload);
  Object.entries(flatPayload).forEach(([k, v]) => params.set(k, v));

  if (CURRENT_USER?.token) params.set("token", CURRENT_USER.token);
  if (CURRENT_USER?.role) params.set("role", CURRENT_USER.role);
  if (CURRENT_USER?.username) params.set("username", CURRENT_USER.username);

  const url = `${API_URL}?${params.toString()}`;
  const response = await fetch(url, { method: "GET" });

  let result;
  try {
    result = await response.json();
  } catch (e) {
    throw new Error("API response មិនមែនជា JSON");
  }

  if (!response.ok || (result && result.success === false)) {
    throw new Error(result?.message || "Request failed");
  }

  return result;
}

// --- LOGIN ---
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const role = document.getElementById("loginRole").value;
  const btn = document.getElementById("loginBtn");

  if (!username || !password || !role) {
    alert("សូមបំពេញ username / password / role");
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "កំពុងចូល...";
    const res = await gasCall("login", { username, password, role });
    if (res.user) saveSession(res.user);
    alert(res.message || "Login success");
    loadDashboard();
  } catch (err) {
    alert(err.message || "Login failed");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
}

// --- DASHBOARD ---
async function loadDashboard() {
  if (!CURRENT_USER) return;
  try {
    const res = await gasCall("getBootstrapData", getFilters());
    if (res.logoUrl) SCHOOL_LOGO_URL = res.logoUrl;
    CURRENT_ROWS = res.rows || [];
    renderCards(res.cards || {});
    renderTable(CURRENT_ROWS);
    populateFilters(res.filterOptions || {});
    const rc = document.getElementById("rowCount");
    if (rc) rc.textContent = CURRENT_ROWS.length + " records";
  } catch (err) {
    alert(err.message || "Error loading dashboard");
  }
}

function reloadData() { loadDashboard(); }
function applyFilters() { loadDashboard(); }

function debounceApplyFilters() {
  clearTimeout(FILTER_TIMER);
  FILTER_TIMER = setTimeout(() => loadDashboard(), 350);
}

function clearFilters() {
  document.getElementById("filterDate").value = "";
  document.getElementById("filterMonth").value = "";
  document.getElementById("filterTeacher").value = "";
  document.getElementById("filterStudent").value = "";
  document.getElementById("searchText").value = "";
  loadDashboard();
}

function populateFilters(options) {
  fillSelect("filterTeacher", options.teachers || [], "-- គ្រូទាំងអស់ --");
  fillSelect("filterStudent", options.students || [], "-- សិស្សទាំងអស់ --");
}

function fillSelect(id, items, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = el.value;
  el.innerHTML =
    '<option value="">' + placeholder + "</option>" +
    items.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  el.value = items.some((x) => String(x) === String(current)) ? current : "";
}

function renderCards(cards) {
  const el = document.getElementById("cards");
  if (!el) return;
  el.innerHTML = `
    <div class="card"><span>សិស្សសរុប</span><strong>${cards.totalStudents || 0}</strong></div>
    <div class="card"><span>សិស្សស្រី</span><strong>${cards.femaleStudents || 0}</strong></div>
    <div class="card"><span>គ្រូសរុប</span><strong>${cards.totalTeachers || 0}</strong></div>
    <div class="card"><span>គ្រូស្រី</span><strong>${cards.femaleTeachers || 0}</strong></div>
    <div class="card"><span>ថវិកាសរុប</span><strong>${fmt(cards.totalBudget)}</strong></div>
    <div class="card"><span>គ្រូ 80%</span><strong>${fmt(cards.teacher80)}</strong></div>
    <div class="card"><span>សាលា 20%</span><strong>${fmt(cards.school20)}</strong></div>
  `;
}

function renderTable(rows) {
  const tbody = document.getElementById("paymentTbody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="16" class="empty">No data</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => {
    const safeId = String(r.ID).replaceAll("'", "\\'");
    const actions = isAdmin()
      ? `<button class="mini blue" onclick="editPayment('${safeId}')">Edit</button>
         <button class="mini red" onclick="deletePaymentRow('${safeId}')">Delete</button>`
      : "";
    return `
      <tr>
        <td>${i + 1}</td>
        <td class="mono">${esc(r.payment_id)}</td>
        <td>${esc(r.student_id)}</td>
        <td>${esc(r.student_name)}</td>
        <td>${esc(r.gender)}</td>
        <td>${esc(r.class)}</td>
        <td>${esc(r.teacher_name)}</td>
        <td>${esc(r.teacher_gender)}</td>
        <td>${fmt(r.amount)}</td>
        <td>${fmt(r.teacher80)}</td>
        <td>${fmt(r.school20)}</td>
        <td>${fmt(r.daily_amount)}</td>
        <td>${esc(r.paid_date)}</td>
        <td>${esc(r.report_date)}</td>
        <td>${r.days || 30}</td>
        <td>
          <div class="row-actions">
            ${actions}
            <button class="mini green" onclick="printReceipt('${safeId}')">Receipt</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// --- MODAL & FORM ---
function openModal() {
  if (!requireAdmin()) return;
  document.getElementById("modalTitle").textContent = "Add Payment";
  document.getElementById("recordInternalId").value = "";
  document.getElementById("recordPaymentId").value = "";
  document.getElementById("paymentForm").reset();
  document.getElementById("teacher_gender").value = "";
  document.getElementById("days").value = 30;
  setTodayDefaults();
  autoCalc();
  document.getElementById("paymentModal").classList.add("show");
}

function closeModal() {
  document.getElementById("paymentModal").classList.remove("show");
}

function autoCalc() {
  const amount = Number(document.getElementById("amount").value || 0);
  const days = Number(document.getElementById("days").value || 30);
  document.getElementById("teacher80").value = Math.round(amount * 0.8);
  document.getElementById("school20").value = Math.round(amount * 0.2);
  document.getElementById("daily_amount").value = days ? Math.round(amount / days) : 0;
}

async function submitPayment(e) {
  e.preventDefault();
  if (!requireAdmin()) return;

  const payload = {
    ID: document.getElementById("recordInternalId").value,
    payment_id: document.getElementById("recordPaymentId").value,
    student_id: document.getElementById("student_id").value,
    student_name: document.getElementById("student_name").value,
    gender: document.getElementById("gender").value,
    class: document.getElementById("class").value,
    teacher_name: document.getElementById("teacher_name").value,
    teacher_gender: document.getElementById("teacher_gender").value,
    amount: document.getElementById("amount").value,
    teacher80: document.getElementById("teacher80").value,
    school20: document.getElementById("school20").value,
    daily_amount: document.getElementById("daily_amount").value,
    paid_date: document.getElementById("paid_date").value,
    report_date: document.getElementById("report_date").value,
    days: document.getElementById("days").value
  };

  const action = payload.ID ? "updatePayment" : "addPayment";

  try {
    const res = await gasCall(action, payload);
    alert(res.message || "Saved");
    closeModal();
    loadDashboard();
  } catch (err) {
    alert(err.message || "Save failed");
  }
}

async function editPayment(id) {
  if (!requireAdmin()) return;
  try {
    const res = await gasCall("getPaymentById", { id });
    const r = res.data;
    if (!r) throw new Error("Record not found");

    document.getElementById("modalTitle").textContent = "Edit Payment";
    document.getElementById("recordInternalId").value = r.ID || "";
    document.getElementById("recordPaymentId").value = r.payment_id || "";
    document.getElementById("student_id").value = r.student_id || "";
    document.getElementById("student_name").value = r.student_name || "";
    document.getElementById("gender").value = r.gender || "";
    document.getElementById("class").value = r.class || "";
    document.getElementById("teacher_name").value = r.teacher_name || "";
    document.getElementById("teacher_gender").value = r.teacher_gender || "";
    document.getElementById("amount").value = r.amount || "";
    document.getElementById("teacher80").value = r.teacher80 || "";
    document.getElementById("school20").value = r.school20 || "";
    document.getElementById("daily_amount").value = r.daily_amount || "";
    document.getElementById("paid_date").value = r.paid_date || "";
    document.getElementById("report_date").value = r.report_date || "";
    document.getElementById("days").value = r.days || 30;

    document.getElementById("paymentModal").classList.add("show");
  } catch (err) {
    alert(err.message || "Edit error");
  }
}

async function deletePaymentRow(id) {
  if (!requireAdmin()) return;
  if (!confirm("តើអ្នកចង់លុបទិន្នន័យនេះមែនទេ?")) return;
  try {
    const res = await gasCall("deletePayment", { id });
    alert(res.message || "Deleted");
    loadDashboard();
  } catch (err) {
    alert(err.message || "Delete failed");
  }
}

// --- REPORTS & EXPORTS ---
async function printReceipt(id) {
  try {
    const res = await gasCall("getReceiptData", { id });
    const r = res.data;
    if (!r) throw new Error("Record not found");

    const w = window.open("", "_blank");
    w.document.write(`
      <html>
      <head><title>Receipt</title><meta charset="utf-8">
      <style>
        body{font-family:Arial,sans-serif;padding:24px}
        .box{max-width:760px;margin:auto;border:2px solid #222;border-radius:16px;padding:24px}
        h2{text-align:center;margin-top:0}
        .line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #bbb}
        .total{font-size:22px;font-weight:700;margin-top:16px}
      </style></head>
      <body>
        <div class="box">
          <h2>បង្កាន់ដៃបង់ប្រាក់</h2>
          <div class="line"><strong>payment_id</strong><span>${esc(r.payment_id)}</span></div>
          <div class="line"><strong>student_name</strong><span>${esc(r.student_name)}</span></div>
          <div class="line"><strong>teacher_name</strong><span>${esc(r.teacher_name)}</span></div>
          <div class="line"><strong>paid_date</strong><span>${esc(r.paid_date)}</span></div>
          <div class="line"><strong>amount</strong><span>${fmt(r.amount)}</span></div>
          <div class="total">សរុប: ${fmt(r.amount)}</div>
        </div>
        <script>window.onload=function(){window.print();}<\/script>
      </body></html>
    `);
    w.document.close();
  } catch (err) {
    alert(err.message || "Receipt failed");
  }
}

async function printDailyReport() {
  try {
    const res = await gasCall("getDailyReport", getFilters());
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Report</title><meta charset="utf-8"></head><body><h2>Daily Report Data Ready</h2><p>Total Budget: ${fmt(res.summary?.totalBudget)}</p><script>window.print();<\/script></body></html>`);
    w.document.close();
  } catch (err) {
    alert(err.message || "Print Failed");
  }
}

async function printMonthlyTeacherReport() {
  try {
    const res = await gasCall("getMonthlyTeacherReport", getFilters());
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>Report</title><meta charset="utf-8"></head><body><h2>Monthly Report Data Ready</h2><p>Total Teachers: ${res.summary?.total_teachers || 0}</p><script>window.print();<\/script></body></html>`);
    w.document.close();
  } catch (err) {
    alert(err.message || "Print Failed");
  }
}

async function exportCsv() {
  try {
    const res = await gasCall("exportFilteredCsv", getFilters());
    if (res && res.url) {
      window.open(res.url, "_blank");
      alert("Export បានជោគជ័យ");
    } else {
      throw new Error("Export failed");
    }
  } catch (err) {
    alert(err.message || "Export failed");
  }
}

// --- INIT ---
function bindFilterEvents() {
  const ids = ["filterDate", "filterMonth", "filterTeacher", "filterStudent"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", loadDashboard);
  });

  const search = document.getElementById("searchText");
  if (search) {
    search.addEventListener("input", debounceApplyFilters);
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loadDashboard();
      }
    });
  }

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

window.onload = () => {
  loadSession();
  bindFilterEvents();
  setTodayDefaults();
  if (CURRENT_USER) loadDashboard();
};
