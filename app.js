const API_URL = "https://script.google.com/macros/s/AKfycbyE-UUo6yu_Fn1SUVYrrwOnvvuCbhmIoq-eW0W7VKh69OeqDZ3BHP4QuWWYdt7RyA5g/exec";
let CURRENT_ROWS = [];
let FILTER_TIMER = null;
let CURRENT_USER = null;
const SESSION_KEY = 'schoolpro_auth';

function saveSession(data) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function getToken() {
  const s = getSession();
  return s?.token || '';
}

async function gasCall(action, payload = {}, requireAuth = true) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      params: payload,
      payload,
      token: requireAuth ? getToken() : ''
    })
  });

  const data = await response.json();
  if (!data?.success) {
    if ((data?.message || '').toLowerCase().includes('login')) {
      forceLogout();
    }
    throw new Error(data?.message || 'Request failed');
  }
  return data;
}

function fmt(n) { return Number(n || 0).toLocaleString() + ' KHR'; }
function esc(t) {
  return String(t ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'", '&#039;');
}
function isAdmin() { return String(CURRENT_USER?.role || '').toLowerCase() === 'admin'; }
function isViewer() { return String(CURRENT_USER?.role || '').toLowerCase() === 'viewer'; }

function updateAuthUI() {
  const authScreen = document.getElementById('authScreen');
  const appShell = document.getElementById('appShell');
  const userBadge = document.getElementById('userBadge');
  const userRole = document.getElementById('userRole');
  const adminOnlyEls = document.querySelectorAll('[data-admin-only="true"]');

  if (CURRENT_USER) {
    authScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    userBadge.textContent = CURRENT_USER.name || CURRENT_USER.username || 'User';
    userRole.textContent = (CURRENT_USER.role || 'viewer').toUpperCase();
  } else {
    authScreen.classList.remove('hidden');
    appShell.classList.add('hidden');
  }

  adminOnlyEls.forEach(el => {
    el.style.display = isAdmin() ? '' : 'none';
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const msg = document.getElementById('loginMessage');
  msg.textContent = 'កំពុង Login...';
  try {
    const res = await gasCall('login', { username, password }, false);
    saveSession({ token: res.token, user: res.user });
    CURRENT_USER = res.user;
    updateAuthUI();
    await loadDashboard();
    msg.textContent = '';
  } catch (err) {
    msg.textContent = err.message || 'Login failed';
  }
}

function forceLogout() {
  clearSession();
  CURRENT_USER = null;
  updateAuthUI();
}

async function logout() {
  try { await gasCall('logout', {}, true); } catch (_) {}
  forceLogout();
}

async function restoreSession() {
  const session = getSession();
  if (!session?.token) {
    forceLogout();
    return;
  }
  try {
    const res = await gasCall('getSession', {}, true);
    CURRENT_USER = res.user;
    saveSession({ token: session.token, user: res.user });
    updateAuthUI();
    await loadDashboard();
  } catch (_) {
    forceLogout();
  }
}

function getFilters() {
  return {
    date: document.getElementById('filterDate').value || '',
    month: document.getElementById('filterMonth').value || '',
    teacher: document.getElementById('filterTeacher').value || '',
    student: document.getElementById('filterStudent').value || '',
    search: document.getElementById('searchText').value || ''
  };
}

async function loadDashboard() {
  const res = await gasCall('getBootstrapData', getFilters());
  CURRENT_ROWS = res.rows || [];
  renderCards(res.cards || {});
  renderTable(CURRENT_ROWS);
  populateFilters(res.filterOptions || {});
  document.getElementById('rowCount').textContent = CURRENT_ROWS.length + ' records';
}

function reloadData() { loadDashboard().catch(showError); }
function applyFilters() { loadDashboard().catch(showError); }
function showError(err) { alert(err?.message || 'Error'); }

function debounceApplyFilters() {
  clearTimeout(FILTER_TIMER);
  FILTER_TIMER = setTimeout(() => loadDashboard().catch(showError), 350);
}

function clearFilters() {
  ['filterDate','filterMonth','filterTeacher','filterStudent','searchText'].forEach(id => {
    document.getElementById(id).value = '';
  });
  loadDashboard().catch(showError);
}

function populateFilters(options) {
  fillSelect('filterTeacher', options.teachers || [], '-- គ្រូទាំងអស់ --');
  fillSelect('filterStudent', options.students || [], '-- សិស្សទាំងអស់ --');
}

function fillSelect(id, items, placeholder) {
  const el = document.getElementById(id);
  const current = el.value;
  el.innerHTML = '<option value="">' + placeholder + '</option>' + items.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
  el.value = items.some(x => String(x) === String(current)) ? current : '';
}

function renderCards(cards) {
  document.getElementById('cards').innerHTML = `
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
  const tbody = document.getElementById('paymentTbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="16" class="empty">No data</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => {
    const adminActions = isAdmin() ? `
      <button class="mini blue" onclick="editPayment('${String(r.ID).replaceAll("'", "\\'")}')">Edit</button>
      <button class="mini red" onclick="deletePaymentRow('${String(r.ID).replaceAll("'", "\\'")}')">Delete</button>` : '';
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
        <td><div class="row-actions">${adminActions}<button class="mini green" onclick="printReceipt('${String(r.ID).replaceAll("'", "\\'")}')">Receipt</button></div></td>
      </tr>`;
  }).join('');
}

function openModal() {
  if (!isAdmin()) return alert('សម្រាប់ Admin ប៉ុណ្ណោះ');
  document.getElementById('modalTitle').textContent = 'Add Payment';
  document.getElementById('recordInternalId').value = '';
  document.getElementById('recordPaymentId').value = '';
  document.getElementById('paymentForm').reset();
  document.getElementById('teacher_gender').value = '';
  document.getElementById('days').value = 30;
  const today = new Date().toISOString().slice(0,10);
  document.getElementById('paid_date').value = today;
  document.getElementById('report_date').value = today;
  autoCalc();
  document.getElementById('paymentModal').classList.add('show');
}
function closeModal() { document.getElementById('paymentModal').classList.remove('show'); }
function autoCalc() {
  const amount = Number(document.getElementById('amount').value || 0);
  const days = Number(document.getElementById('days').value || 30);
  document.getElementById('teacher80').value = Math.round(amount * 0.8);
  document.getElementById('school20').value = Math.round(amount * 0.2);
  document.getElementById('daily_amount').value = days ? Math.round(amount / days) : 0;
}

async function submitPayment(e) {
  e.preventDefault();
  if (!isAdmin()) return alert('សម្រាប់ Admin ប៉ុណ្ណោះ');
  const payload = {
    ID: document.getElementById('recordInternalId').value,
    payment_id: document.getElementById('recordPaymentId').value,
    student_id: document.getElementById('student_id').value,
    student_name: document.getElementById('student_name').value,
    gender: document.getElementById('gender').value,
    class: document.getElementById('class').value,
    teacher_name: document.getElementById('teacher_name').value,
    teacher_gender: document.getElementById('teacher_gender').value,
    amount: document.getElementById('amount').value,
    teacher80: document.getElementById('teacher80').value,
    school20: document.getElementById('school20').value,
    daily_amount: document.getElementById('daily_amount').value,
    paid_date: document.getElementById('paid_date').value,
    report_date: document.getElementById('report_date').value,
    days: document.getElementById('days').value
  };
  const action = payload.ID ? 'updatePayment' : 'addPayment';
  try {
    const res = await gasCall(action, payload);
    alert(res.message || 'Saved');
    closeModal();
    loadDashboard();
  } catch (err) { alert(err.message || 'Save failed'); }
}

async function editPayment(id) {
  if (!isAdmin()) return alert('សម្រាប់ Admin ប៉ុណ្ណោះ');
  try {
    const res = await gasCall('getPaymentById', id);
    const r = res.data;
    if (!r) throw new Error('Record not found');
    document.getElementById('modalTitle').textContent = 'Edit Payment';
    ['recordInternalId','recordPaymentId','student_id','student_name','gender','class','teacher_name','teacher_gender','amount','teacher80','school20','daily_amount','paid_date','report_date','days'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('recordInternalId').value = r.ID || '';
    document.getElementById('recordPaymentId').value = r.payment_id || '';
    document.getElementById('student_id').value = r.student_id || '';
    document.getElementById('student_name').value = r.student_name || '';
    document.getElementById('gender').value = r.gender || '';
    document.getElementById('class').value = r.class || '';
    document.getElementById('teacher_name').value = r.teacher_name || '';
    document.getElementById('teacher_gender').value = r.teacher_gender || '';
    document.getElementById('amount').value = r.amount || '';
    document.getElementById('teacher80').value = r.teacher80 || '';
    document.getElementById('school20').value = r.school20 || '';
    document.getElementById('daily_amount').value = r.daily_amount || '';
    document.getElementById('paid_date').value = r.paid_date || '';
    document.getElementById('report_date').value = r.report_date || '';
    document.getElementById('days').value = r.days || 30;
    document.getElementById('paymentModal').classList.add('show');
  } catch(err) { alert(err.message || 'Edit error'); }
}

async function deletePaymentRow(id) {
  if (!isAdmin()) return alert('សម្រាប់ Admin ប៉ុណ្ណោះ');
  if (!confirm('តើអ្នកចង់លុបទិន្នន័យនេះមែនទេ?')) return;
  try {
    const res = await gasCall('deletePayment', id);
    alert(res.message || 'Deleted');
    loadDashboard();
  } catch (err) { alert(err.message || 'Delete failed'); }
}

async function printReceipt(id) {
  try {
    const res = await gasCall('getReceiptData', id);
    const r = res.data;
    if (!r) throw new Error('Record not found');
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Receipt</title><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;padding:24px}.box{max-width:760px;margin:auto;border:2px solid #222;border-radius:16px;padding:24px}
      h2{text-align:center;margin-top:0}.line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #bbb}.total{font-size:22px;font-weight:700;margin-top:16px}
      </style></head><body><div class="box"><h2>បង្កាន់ដៃបង់ប្រាក់</h2>
      <div class="line"><strong>payment_id</strong><span>${esc(r.payment_id)}</span></div>
      <div class="line"><strong>student_name</strong><span>${esc(r.student_name)}</span></div>
      <div class="line"><strong>teacher_name</strong><span>${esc(r.teacher_name)}</span></div>
      <div class="line"><strong>paid_date</strong><span>${esc(r.paid_date)}</span></div>
      <div class="line"><strong>amount</strong><span>${fmt(r.amount)}</span></div>
      <div class="total">សរុប: ${fmt(r.amount)}</div></div><script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  } catch (err) { alert(err.message || 'Receipt failed'); }
}

async function printDailyReport() {
  try {
    const res = await gasCall('getDailyReport', getFilters());
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Report</title><meta charset="utf-8"></head><body><h2>Daily Report</h2><p>Total Budget: ${fmt(res.summary.totalBudget)}</p><script>window.print();<\/script></body></html>`);
    w.document.close();
  } catch(err) { alert(err.message || 'Print Failed'); }
}

async function printMonthlyTeacherReport() {
  try {
    const res = await gasCall('getMonthlyTeacherReport', getFilters());
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Report</title><meta charset="utf-8"></head><body><h2>Monthly Report</h2><p>Total Teachers: ${res.summary.total_teachers}</p><script>window.print();<\/script></body></html>`);
    w.document.close();
  } catch(err) { alert(err.message || 'Print Failed'); }
}

async function exportCsv() {
  try {
    const res = await gasCall('exportFilteredCsv', getFilters());
    if (res && res.url) {
      window.open(res.url, '_blank');
      alert('Export បានជោគជ័យ');
    } else throw new Error('Export failed');
  } catch(err) { alert(err.message); }
}

function bindFilterEvents() {
  ['filterDate', 'filterMonth', 'filterTeacher', 'filterStudent'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => loadDashboard().catch(showError));
  });
  const search = document.getElementById('searchText');
  if (search) {
    search.addEventListener('input', debounceApplyFilters);
    search.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadDashboard().catch(showError); }});
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

window.onload = () => {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  bindFilterEvents();
  updateAuthUI();
  restoreSession();
};
