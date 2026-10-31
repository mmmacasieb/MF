/* ============ FIREBASE SDK ============ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import { getDatabase, ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCy8Uq-YdZt65K4lUiNSMnP6TU6Kc54KJU",
  authDomain: "budg-mf22.firebaseapp.com",
  databaseURL: "https://budg-mf22-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "budg-mf22",
  storageBucket: "budg-mf22.firebasestorage.app",
  messagingSenderId: "924636505416",
  appId: "1:924636505416:web:c54297f60957e6e51aff7d",
  measurementId: "G-MZJEF74FS8"
};
const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);
try { getAnalytics(fbApp); } catch (e) { /* analytics is optional */ }

(() => {
"use strict";

/* ============ CONFIG ============ */
const OWNER = document.body.dataset.owner === "b" ? "b" : "a";   // which person's page this is
const PALETTE = ["#0f2f6b", "#1a4fc1", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#0ea5e9", "#7dd3fc", "#1e3a8a", "#bfdbfe"];
const SEED = [
  ["House", "expense", ["Rent / Mortgage", "Electricity", "Water", "Internet"]],
  ["Food", "expense", ["Groceries", "Dining out"]],
  ["Transportation", "expense", ["Fuel", "Commute"]],
  ["Subscription", "expense", ["Netflix", "Spotify"]],
  ["Loan", "expense", []],
  ["Personal Expenses", "expense", ["Clothes", "Shopping", "Self-care"]],
  ["Savings", "savings", ["Emergency fund"]],
  ["Extra's", "expense", ["Gifts", "Misc"]]
];
const ICON = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

/* ============ HELPERS ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const today = () => new Date().toLocaleDateString("en-CA");
const r2 = n => Math.round((+n || 0) * 100) / 100;
const fdate = d => d ? new Date(d + "T00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "—";
const monthLabel = m => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleString("en", { month: "long", year: "numeric" }); };
const shiftMonth = (m, d) => { const [y, mo] = m.split("-").map(Number); const dt = new Date(y, mo - 1 + d, 1); return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0"); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function addMonth(d) {
  const [y, m, dd] = d.split("-").map(Number);
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dd, last)).toLocaleDateString("en-CA");
}
function addDays(d, n) { const dt = new Date(d + "T00:00"); dt.setDate(dt.getDate() + n); return dt.toLocaleDateString("en-CA"); }
function dueLabel(d) {
  const diff = Math.round((new Date(d + "T00:00") - new Date(today() + "T00:00")) / 864e5);
  if (diff < 0) return `Overdue ${-diff}d`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

/* ============ STATE ============ */
// R = the whole household database. S = this page owner's view of it (own money + shared settings).
let code = localStorage.getItem("bt_code") || "";
let R = {};
let S = {};
let es = null;
let ready = false;
let viewMonth = today().slice(0, 7);
let calSel = today();
let calView = "budget";
const F = { q: "", cat: "", month: "" };
const charts = {};

function view() {
  const p = (R.people || {})[OWNER] || {};
  S = { ...p, settings: { ...(R.settings || {}), opening: p.opening } };
}
const settings = () => S.settings || {};
const cur = () => settings().currency || "₱";
const nameOf = k => (k === "b" ? (settings().nameB || "Partner 2") : (settings().nameA || "Partner 1"));
function fmt(n) {
  n = Number(n) || 0;
  return (n < 0 ? "-" : "") + cur() + Math.abs(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const fmtShort = n => cur() + Math.round(n).toLocaleString("en-PH");

const cats = () => Object.entries(S.categories || {}).map(([id, c]) => ({
  id, ...c,
  subList: Object.entries(c.subs || {}).map(([sid, s]) => ({ id: sid, ...s })).sort((a, b) => (a.order || 0) - (b.order || 0))
})).sort((a, b) => (a.order || 0) - (b.order || 0));
const txs = () => Object.entries(S.transactions || {}).map(([id, t]) => ({ id, ...t, date: t.date || "", amount: +t.amount || 0 }))
  .sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
const bills = () => Object.entries(S.bills || {}).map(([id, b]) => ({ id, ...b, amount: +b.amount || 0, due: b.due || today() })).sort((a, b) => a.due.localeCompare(b.due));
const targets = () => Object.entries(S.targets || {}).map(([id, t]) => ({ id, ...t })).sort((a, b) => (a.order || 0) - (b.order || 0));

const isSavings = cid => (S.categories || {})[cid]?.kind === "savings";
const opening = () => +settings().opening || 0;
const mainMoney = () => txs().reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), opening());
const savedTotal = () => txs().filter(t => isSavings(t.catId)).reduce((s, t) => s + (t.type === "income" ? -t.amount : t.amount), 0);

function monthStats(m) {
  const r = { income: 0, spent: 0, saved: 0 };
  txs().filter(t => t.date.startsWith(m)).forEach(t => {
    if (isSavings(t.catId)) r.saved += t.type === "income" ? -t.amount : t.amount;
    else if (t.type === "income") r.income += t.amount;
    else r.spent += t.amount;
  });
  return r;
}
const spendOf = (m, catId, subId) => txs()
  .filter(t => t.date.startsWith(m) && t.catId === catId && (!subId || t.subId === subId))
  .reduce((s, t) => s + (t.type === "income" ? -t.amount : t.amount), 0);
const paidInCat = cid => txs().filter(t => t.catId === cid).reduce((s, t) => s + (t.type === "income" ? -t.amount : t.amount), 0);
const targetProgress = t => (+t.manual || 0) + (t.catId && (S.categories || {})[t.catId] ? paidInCat(t.catId) : 0);

function catLabel(t) {
  if (!t.catId) return t.type === "income" ? "Income" : "Uncategorized";
  const c = (S.categories || {})[t.catId];
  if (!c) return "Deleted category";
  const sub = t.subId && c.subs && c.subs[t.subId];
  return c.name + (sub ? " › " + sub.name : "");
}

/* ============ FIREBASE (REST) ============ */
const root = () => ref(db, `households/${code}`);
function setIn(obj, path, val) {
  const parts = path.split("/");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== "object" || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
  const k = parts[parts.length - 1];
  if (val === null) delete o[k]; else o[k] = val;
}
// Paths used by the UI are relative to the page owner. Shared settings stay shared; "opening" is personal.
function real(path) {
  if (path === "settings" || path.startsWith("settings/")) {
    const k = path.split("/")[1];
    return k === "opening" ? `people/${OWNER}/opening` : path;
  }
  return `people/${OWNER}/${path}`;
}
async function run(fn) {
  setStatus("saving");
  try { await fn(); setStatus("ok"); }
  catch (e) { setStatus("error"); toast("Couldn't save — check your internet and Firebase rules"); }
}
async function multi(updates) {
  const mapped = {};
  Object.entries(updates).forEach(([k, v]) => { const rp = real(k); mapped[rp] = v; setIn(R, rp, v); });
  view(); render();
  await run(() => update(root(), mapped));
}
const write = (path, val) => multi({ [path]: val });
const patch = (path, obj) => multi(Object.fromEntries(Object.entries(obj).map(([k, v]) => [path + "/" + k, v])));

function setStatus(s) {
  const el = $("#syncPill"); if (!el) return;
  el.className = "sync " + s;
  $("em", el).textContent = { ok: "Synced", saving: "Saving…", error: "Not saved", offline: "Offline", connecting: "Connecting" }[s] || s;
}
function listen() {
  // live feed: fires instantly on this device and whenever the other device saves
  onValue(root(), snap => { R = snap.val() || {}; view(); render(); }, () => { setStatus("error"); toast("Firebase blocked reading — publish the database rules"); });
  onValue(ref(db, ".info/connected"), snap => setStatus(snap.val() ? "ok" : "offline"));
}

/* ============ UI PRIMITIVES ============ */
function modalRoot() {
  let m = $("#modal");
  if (!m) { m = document.createElement("div"); m.id = "modal"; document.body.appendChild(m); }
  return m;
}
let toastTimer;
function toast(msg, ms = 3200) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

function askForm({ title, fields = [], submit = "Save", note = "", locked = false, danger = false }) {
  return new Promise(resolve => {
    const root = modalRoot();
    const ctl = f => {
      const id = "f_" + f.k;
      if (f.type === "select") return `<select name="${f.k}" id="${id}"></select>`;
      if (f.type === "textarea") return `<textarea name="${f.k}" id="${id}" rows="2">${esc(f.value)}</textarea>`;
      return `<input name="${f.k}" id="${id}" type="${f.type || "text"}" value="${esc(f.value ?? "")}" ${f.step ? `step="${f.step}"` : ""} ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.required ? "required" : ""} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">`;
    };
    root.innerHTML = `<div class="modal-card"><h3>${esc(title)}</h3>${note ? `<p>${esc(note)}</p>` : ""}<form>
      ${fields.map(f => `<label class="fld"><span>${esc(f.label)}</span>${ctl(f)}${f.hint ? `<small>${esc(f.hint)}</small>` : ""}</label>`).join("")}
      <div class="modal-actions">${locked ? "" : `<button type="button" class="btn ghost" data-close>Cancel</button>`}<button class="btn ${danger ? "danger" : "primary"}">${esc(submit)}</button></div></form></div>`;
    const form = $("form", root);
    const close = val => { root.classList.remove("open"); root.onclick = null; document.removeEventListener("keydown", onKey); resolve(val); };
    const onKey = e => { if (e.key === "Escape" && !locked) close(null); };
    const fill = () => {
      fields.filter(f => f.type === "select").forEach(f => {
        const el = form.elements[f.k];
        const prev = el.options.length ? el.value : (f.value ?? "");
        const cv = Object.fromEntries(new FormData(form));
        const opts = f.options(cv);
        el.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
        el.value = opts.some(o => o[0] === prev) ? prev : (opts[0] ? opts[0][0] : "");
      });
    };
    fill();
    form.addEventListener("change", fill);
    form.onsubmit = e => { e.preventDefault(); close(Object.fromEntries(new FormData(form))); };
    root.onclick = e => { if (e.target === root && !locked) close(null); };
    const cancel = $("[data-close]", root); if (cancel) cancel.onclick = () => close(null);
    document.addEventListener("keydown", onKey);
    root.classList.add("open");
    const first = form.querySelector("input:not([type=hidden]),select"); if (first) setTimeout(() => first.focus(), 50);
  });
}
async function confirmBox(msg, ok = "Delete") {
  return !!(await askForm({ title: "Are you sure?", note: msg, submit: ok, danger: true }));
}

/* ============ FORMS ============ */
const subOptions = vals => [["", "— none —"], ...Object.entries(((S.categories || {})[vals.catId] || {}).subs || {}).map(([id, s]) => [id, s.name])];

async function txForm(t = {}) {
  if (!cats().length) { toast("Add a category first (Categories tab)"); return; }
  const v = await askForm({
    title: t.id ? "Edit transaction" : (t.type === "income" ? "Add income" : "Add transaction"),
    submit: t.id ? "Save changes" : "Add",
    fields: [
      { k: "type", label: "Type", type: "select", value: t.type || "expense", options: () => [["expense", "Expense — money out"], ["income", "Income — money in"]] },
      { k: "amount", label: "Amount", type: "number", value: t.amount, required: true, step: "0.01", min: "0.01" },
      { k: "date", label: "Date", type: "date", value: t.date || today(), required: true },
      { k: "catId", label: "Category", type: "select", value: t.catId || "", options: vals => vals.type === "income"
        ? [["", "Income (salary, side job, other)"], ...cats().filter(c => c.kind === "savings").map(c => [c.id, "Withdraw from " + c.name])]
        : cats().map(c => [c.id, c.name + (c.kind === "savings" ? " (savings)" : "")]) },
      { k: "subId", label: "Sub-category", type: "select", value: t.subId || "", options: subOptions },
      { k: "note", label: "Note (optional)", value: t.note || "", placeholder: "e.g. weekly groceries" }
    ]
  });
  if (!v) return;
  const id = t.id || uid();
  await write("transactions/" + id, {
    type: v.type, amount: r2(v.amount), date: v.date, catId: v.catId || "", subId: v.subId || "",
    note: (v.note || "").trim(), created: t.created || Date.now(), ...(t.billId ? { billId: t.billId } : {})
  });
  toast(t.id ? "Transaction updated" : "Added");
}

async function catForm(c = {}) {
  const v = await askForm({
    title: c.id ? "Edit category" : "New category",
    fields: [
      { k: "name", label: "Name", value: c.name || "", required: true, placeholder: "e.g. Pets" },
      { k: "kind", label: "Type", type: "select", value: c.kind || "expense", options: () => [["expense", "Spending — money out"], ["savings", "Savings pot — money set aside"]] },
      { k: "budget", label: "Monthly budget target (optional)", type: "number", step: "0.01", min: "0", value: c.budget || "", hint: "Just a target to compare against. It never changes your main money." }
    ]
  });
  if (!v) return;
  if (c.id) await patch("categories/" + c.id, { name: v.name.trim(), kind: v.kind, budget: r2(v.budget) });
  else await write("categories/" + uid(), { name: v.name.trim(), kind: v.kind, budget: r2(v.budget), order: Date.now() });
}
async function subForm(cid, s = {}) {
  const v = await askForm({
    title: s.id ? "Edit sub-category" : "New sub-category",
    note: "Inside " + (S.categories[cid] || {}).name,
    fields: [{ k: "name", label: "Name", value: s.name || "", required: true, placeholder: "e.g. Clothes" }]
  });
  if (!v) return;
  if (s.id) await patch(`categories/${cid}/subs/${s.id}`, { name: v.name.trim() });
  else await write(`categories/${cid}/subs/${uid()}`, { name: v.name.trim(), order: Date.now() });
}

async function billForm(b = {}) {
  if (!cats().length) { toast("Add a category first"); return; }
  const v = await askForm({
    title: b.id ? "Edit bill" : "New bill / due",
    note: "Won't change your money until you mark it paid.",
    fields: [
      { k: "name", label: "Name", value: b.name || "", required: true, placeholder: "e.g. Car loan payment" },
      { k: "amount", label: "Amount", type: "number", step: "0.01", min: "0.01", value: b.amount, required: true },
      { k: "due", label: "Due date", type: "date", value: b.due || today(), required: true },
      { k: "catId", label: "Category", type: "select", value: b.catId || "", options: () => cats().map(c => [c.id, c.name]) },
      { k: "subId", label: "Sub-category", type: "select", value: b.subId || "", options: subOptions },
      { k: "repeat", label: "Repeats", type: "select", value: b.repeat || "none", options: () => [["none", "One time"], ["weekly", "Every week"], ["monthly", "Every month"]] }
    ]
  });
  if (!v) return;
  await write("bills/" + (b.id || uid()), { name: v.name.trim(), amount: r2(v.amount), due: v.due, catId: v.catId, subId: v.subId || "", repeat: v.repeat });
}
async function payBill({ id }) {
  const b = (S.bills || {})[id]; if (!b) return;
  const v = await askForm({
    title: "Mark as paid", submit: "Mark paid",
    note: `${b.name} will be taken out of your main money.`,
    fields: [
      { k: "amount", label: "Amount paid", type: "number", step: "0.01", min: "0.01", value: b.amount, required: true },
      { k: "date", label: "Date paid", type: "date", value: today(), required: true }
    ]
  });
  if (!v) return;
  const tid = uid();
  const up = { ["transactions/" + tid]: { type: "expense", amount: r2(v.amount), date: v.date, catId: b.catId || "", subId: b.subId || "", note: b.name, created: Date.now(), billId: id } };
  if (b.repeat === "monthly") up[`bills/${id}/due`] = addMonth(b.due);
  else if (b.repeat === "weekly") up[`bills/${id}/due`] = addDays(b.due, 7);
  else up["bills/" + id] = null;
  await multi(up);
  toast("Paid — main money updated");
}

async function targetForm(t = {}) {
  const v = await askForm({
    title: t.id ? "Edit target" : "New target",
    note: "Targets never change your main money.",
    fields: [
      { k: "name", label: "Name", value: t.name || "", required: true, placeholder: "e.g. Pay off car loan" },
      { k: "goal", label: "Goal amount", type: "number", step: "0.01", min: "1", value: t.goal, required: true },
      { k: "manual", label: "Progress so far (manual)", type: "number", step: "0.01", value: t.manual || 0 },
      { k: "catId", label: "Auto-track from category (optional)", type: "select", value: t.catId || "", options: () => [["", "— none, manual only —"], ...cats().map(c => [c.id, c.name])],
        hint: "Example: link to Loan — every loan payment you log counts toward this target." },
      { k: "deadline", label: "Deadline (optional)", type: "date", value: t.deadline || "" }
    ]
  });
  if (!v) return;
  await write("targets/" + (t.id || uid()), { name: v.name.trim(), goal: r2(v.goal), manual: r2(v.manual), catId: v.catId || "", deadline: v.deadline || "", order: t.order || Date.now() });
}
async function progTarget({ id }) {
  const t = (S.targets || {})[id]; if (!t) return;
  const v = await askForm({
    title: "Add progress", submit: "Add",
    note: "Only updates this target — your main money stays the same.",
    fields: [{ k: "amount", label: "Amount (use a minus to subtract)", type: "number", step: "0.01", required: true }]
  });
  if (!v) return;
  await patch("targets/" + id, { manual: r2((+t.manual || 0) + (+v.amount)) });
}

async function setBalance() {
  const bal = mainMoney();
  const v = await askForm({
    title: "Set main money", note: "Enter how much money you actually have right now. Future entries add to or subtract from it.",
    fields: [{ k: "amount", label: "Current money", type: "number", step: "0.01", value: r2(bal), required: true }]
  });
  if (!v) return;
  await write("settings/opening", r2(opening() + (+v.amount - bal)));
  toast("Balance updated");
}

/* ============ ACTIONS ============ */
const A = {
  addIncome: () => txForm({ type: "income" }),
  addExpense: () => txForm({ type: "expense" }),
  addTxCat: d => txForm({ type: "expense", catId: d.id }),
  editTx: d => txForm({ id: d.id, ...(S.transactions || {})[d.id] }),
  delTx: async d => { if (await confirmBox("This transaction will be removed and your main money will adjust.")) { await write("transactions/" + d.id, null); toast("Deleted"); } },
  addCat: () => catForm(),
  editCat: d => catForm({ id: d.id, ...S.categories[d.id] }),
  delCat: async d => { if (await confirmBox(`Delete “${S.categories[d.id].name}” and its sub-categories? Past transactions stay but lose their category.`)) await write("categories/" + d.id, null); },
  addSub: d => subForm(d.id),
  editSub: d => subForm(d.cat, { id: d.id, ...S.categories[d.cat].subs[d.id] }),
  delSub: async d => { if (await confirmBox("Delete this sub-category?")) await write(`categories/${d.cat}/subs/${d.id}`, null); },
  addBill: () => billForm(),
  editBill: d => billForm({ id: d.id, ...S.bills[d.id] }),
  delBill: async d => { if (await confirmBox("Delete this bill?")) await write("bills/" + d.id, null); },
  payBill,
  addTarget: () => targetForm(),
  editTarget: d => targetForm({ id: d.id, ...S.targets[d.id] }),
  delTarget: async d => { if (await confirmBox("Delete this target? Your money is not affected.")) await write("targets/" + d.id, null); },
  progTarget,
  setBalance,
  calDay: d => { calSel = d.date; render(); },
  calView: d => { calView = d.v; render(); },
  calAddExp: d => txForm({ type: "expense", date: d.date }),
  calAddInc: d => txForm({ type: "income", date: d.date }),
  prevMonth: () => { viewMonth = shiftMonth(viewMonth, -1); render(); },
  nextMonth: () => { viewMonth = shiftMonth(viewMonth, 1); render(); },
  copyCode: () => { navigator.clipboard?.writeText(code); toast("Household code copied"); },
  switchHome: async () => { if (await confirmBox("Switch to a different household code on this device?", "Switch")) { localStorage.removeItem("bt_code"); location.reload(); } },
  exportJson: () => download(`budget-${nameOf(OWNER)}-${today()}.json`, JSON.stringify((R.people || {})[OWNER] || {}, null, 2), "application/json"),
  exportCsv: () => {
    const rows = [["Date", "Type", "Amount", "Category", "Note"]].concat(txs().map(t => [t.date, t.type, t.amount, catLabel(t), t.note || ""]));
    download(`transactions-${nameOf(OWNER)}-${today()}.csv`, rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  },
  restore: () => $("#restoreFile").click()
};
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (b && A[b.dataset.act]) { e.preventDefault(); A[b.dataset.act](b.dataset); }
});

/* ============ RENDER: shared ============ */
function render() {
  if (!ready) return;
  const mine = nameOf(OWNER);
  document.title = mine + " · Budget";
  $("#navA").textContent = nameOf("a"); $("#navB").textContent = nameOf("b");
  $("#heroEyebrow").textContent = mine + " · Main money";
  const chip = $("#codeChip"); if (chip) chip.textContent = "Code: " + code;
  renderHome(); renderManage();
}

const barHTML = (pct, over) => `<div class="bar-track ${over ? "over" : ""}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
const rowActions = (act, id, extra = "") => `<div class="row-actions">${extra}<button class="icon-btn" title="Edit" data-act="edit${act}" data-id="${id}">${ICON.edit}</button><button class="icon-btn" title="Delete" data-act="del${act}" data-id="${id}">${ICON.del}</button></div>`;
const txRowCells = t => `<td>${fdate(t.date)}</td><td><b>${esc(t.note || (t.subId && S.categories?.[t.catId]?.subs?.[t.subId]?.name) || catLabel(t).split(" › ")[0])}</b></td><td><span class="tag">${esc(catLabel(t))}</span></td><td class="r ${t.type === "income" ? "pos" : "neg"}">${t.type === "income" ? "+" : "−"}${fmt(t.amount)}</td>`;

function drawChart(id, cfg) {
  const el = document.getElementById(id); if (!el || !window.Chart) return;
  if (charts[id]) { charts[id].data = cfg.data; charts[id].options = cfg.options; charts[id].update("none"); return; }
  charts[id] = new Chart(el, cfg);
}

/* ============ RENDER: overview ============ */
function renderHome() {
  const m = viewMonth, st = monthStats(m), bal = mainMoney(), now = today();
  const [y, mo] = m.split("-").map(Number);
  const dim = new Date(y, mo, 0).getDate();
  const elapsed = m === now.slice(0, 7) ? +now.slice(8) : dim;
  const avg = st.spent / Math.max(1, elapsed);
  const net = st.income - st.spent - st.saved;
  const pending = bills();
  const dueSum = pending.reduce((s, b) => s + b.amount, 0);

  $("#mainMoney").textContent = fmt(bal);
  $("#heroSub").textContent = `This month: ${net >= 0 ? "+" : "−"}${fmt(Math.abs(net))} net · avg ${fmt(avg)}/day spent · ${st.income > 0 ? Math.round(st.saved / st.income * 100) : 0}% of income saved`;
  $("#stIncome").textContent = fmt(st.income);
  $("#stSpent").textContent = fmt(st.spent);
  $("#stSaved").textContent = fmt(st.saved);
  $("#stSavedAll").textContent = "All-time pot: " + fmt(savedTotal());
  $("#stDues").textContent = fmt(dueSum);
  $("#stDuesN").textContent = pending.length + (pending.length === 1 ? " bill pending" : " bills pending");
  $("#stMonthA").textContent = $("#stMonthB").textContent = monthLabel(m);
  $("#monthLabel").textContent = monthLabel(m);

  const mt = txs().filter(t => t.date.startsWith(m));
  const cm = Object.fromEntries(cats().map((c, i) => [c.id, { ...c, color: PALETTE[i % PALETTE.length] }]));
  const font = { family: "Plus Jakarta Sans", weight: 600 };

  // donut
  const byCat = {};
  mt.forEach(t => { if (t.catId && cm[t.catId]) byCat[t.catId] = (byCat[t.catId] || 0) + (t.type === "income" ? -t.amount : t.amount); });
  const ents = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  $("#donutEmpty").style.display = ents.length ? "none" : "flex";
  drawChart("cDonut", {
    type: "doughnut",
    data: { labels: ents.map(([id]) => cm[id].name), datasets: [{ data: ents.map(([, v]) => v), backgroundColor: ents.map(([id]) => cm[id].color), borderColor: "#fff", borderWidth: 3, hoverOffset: 8 }] },
    options: { maintainAspectRatio: false, cutout: "66%", plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 8, font, color: "#0f2a5c" } }, tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed)}` } } } }
  });

  // monthly
  const months = [...Array(6)].map((_, i) => shiftMonth(m, i - 5));
  const stats = months.map(monthStats);
  drawChart("cMonthly", {
    type: "bar",
    data: { labels: months.map(x => monthLabel(x).split(" ")[0].slice(0, 3)), datasets: [
      { label: "Income", data: stats.map(s => s.income), backgroundColor: "#93c5fd", borderRadius: 10, borderSkipped: false },
      { label: "Spent", data: stats.map(s => s.spent), backgroundColor: "#1a4fc1", borderRadius: 10, borderSkipped: false },
      { label: "Saved", data: stats.map(s => s.saved), backgroundColor: "#0f2f6b", borderRadius: 10, borderSkipped: false }] },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, font, color: "#0f2a5c" } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)}` } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => fmtShort(v), color: "#6a84b3" }, grid: { color: "#e9f1fc" }, border: { display: false } } } }
  });

  // trend (last 30 days)
  const days = [...Array(30)].map((_, i) => addDays(now, i - 29));
  const all = txs();
  let run = all.filter(t => t.date < days[0]).reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), opening());
  const points = days.map(d => { all.filter(t => t.date === d).forEach(t => { run += t.type === "income" ? t.amount : -t.amount; }); return r2(run); });
  drawChart("cTrend", {
    type: "line",
    data: { labels: days.map(d => fdate(d).replace(/, \d{4}/, "")), datasets: [{ label: "Main money", data: points, borderColor: "#2563eb", borderWidth: 3, tension: .35, pointRadius: 0, pointHoverRadius: 6, fill: true,
      backgroundColor: ctx => { const { ctx: c, chartArea } = ctx.chart; if (!chartArea) return "rgba(59,130,246,.15)"; const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom); g.addColorStop(0, "rgba(59,130,246,.35)"); g.addColorStop(1, "rgba(59,130,246,0)"); return g; } }] },
    options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => " " + fmt(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: "#6a84b3" } }, y: { ticks: { callback: v => fmtShort(v), color: "#6a84b3" }, grid: { color: "#e9f1fc" }, border: { display: false } } } }
  });

  // daily spending this month
  const daily = [...Array(dim)].map(() => 0);
  mt.forEach(t => { if (t.type === "expense" && !isSavings(t.catId)) { const d = +t.date.slice(8, 10); if (d >= 1 && d <= dim) daily[d - 1] += t.amount; } });
  $("#dailyEmpty").style.display = daily.some(v => v > 0) ? "none" : "flex";
  drawChart("cDaily", {
    type: "bar",
    data: { labels: daily.map((_, i) => i + 1), datasets: [{ data: daily, backgroundColor: "#3b82f6", borderRadius: 6, borderSkipped: false }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => "Day " + c[0].label, label: c => " " + fmt(c.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10, color: "#6a84b3" } }, y: { ticks: { callback: v => fmtShort(v), color: "#6a84b3" }, grid: { color: "#e9f1fc" }, border: { display: false } } } }
  });

  // budgets
  const withBudget = cats().filter(c => +c.budget > 0);
  $("#listBudgets").innerHTML = withBudget.length ? withBudget.map(c => {
    const sp = spendOf(m, c.id), b = +c.budget, over = sp > b;
    return `<div class="meter-row"><div class="meter-top"><span>${esc(c.name)}</span><span>${fmt(sp)} of ${fmt(b)}${over ? " · over by " + fmt(sp - b) : ""}</span></div>${barHTML(sp / b * 100, over)}</div>`;
  }).join("") : `<div class="empty">Set a monthly budget on a category (Categories tab) to see progress here.</div>`;

  // dues
  $("#listDues").innerHTML = pending.length ? pending.slice(0, 6).map(b => `<div class="item"><div class="item-main"><b>${esc(b.name)}</b><span class="muted">${esc((S.categories?.[b.catId] || {}).name || "—")} · ${dueLabel(b.due)}</span></div><div class="item-right"><b>${fmt(b.amount)}</b><button class="btn primary tiny" data-act="payBill" data-id="${b.id}">Mark paid</button></div></div>`).join("")
    : `<div class="empty">No bills waiting. Add loans, rent or subscriptions in the Bills &amp; Targets tab.</div>`;

  // targets
  const tg = targets();
  $("#listTargets").innerHTML = tg.length ? tg.map(t => { const p = targetProgress(t), g = +t.goal || 1; return `<div class="meter-row"><div class="meter-top"><span>${esc(t.name)}</span><span>${fmt(p)} of ${fmt(g)} · ${Math.min(100, Math.round(p / g * 100))}%</span></div>${barHTML(p / g * 100)}</div>`; }).join("")
    : `<div class="empty">No targets yet. Create one in the Bills &amp; Targets tab.</div>`;

  renderCalendar();

  // recent
  const rec = txs().slice(0, 8);
  $("#tblRecent").innerHTML = rec.length ? rec.map(t => `<tr>${txRowCells(t)}</tr>`).join("") : `<tr><td colspan="4"><div class="empty" style="margin:6px">Nothing yet — add your first income or expense.</div></td></tr>`;
}

function renderCalendar() {
  const grid = $("#calGrid"); if (!grid) return;
  const m = viewMonth, [y, mo] = m.split("-").map(Number), now = today();
  const first = new Date(y, mo - 1, 1).getDay(), dim = new Date(y, mo, 0).getDate();
  const T = txs().filter(t => t.date.startsWith(m));
  const B = bills().filter(b => b.due.startsWith(m));
  const G = targets().filter(t => t.deadline && t.deadline.startsWith(m));

  let h = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < first; i++) h += `<div class="cal-cell blank"></div>`;
  for (let n = 1; n <= dim; n++) {
    const d = m + "-" + String(n).padStart(2, "0");
    const out = T.filter(t => t.date === d && t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const inn = T.filter(t => t.date === d && t.type === "income").reduce((s, t) => s + t.amount, 0);
    const due = B.filter(b => b.due === d).length + G.filter(t => t.deadline === d).length;
    h += `<button type="button" class="cal-cell${d === now ? " today" : ""}${d === calSel ? " sel" : ""}" data-act="calDay" data-date="${d}"><span class="cal-n">${n}</span>${inn ? `<span class="cal-in">+${fmtShort(inn)}</span>` : ""}${out ? `<span class="cal-out">−${fmtShort(out)}</span>` : ""}${due ? `<span class="cal-bill">${due} due</span>` : ""}</button>`;
  }
  grid.innerHTML = h;

  const box = $("#calDetail");
  if (!calSel.startsWith(m)) {
    box.innerHTML = `<div class="empty">Pick a day to see what happened or what's due.</div>`;
  } else {
    const tl = txs().filter(t => t.date === calSel), bl = bills().filter(b => b.due === calSel), gl = targets().filter(t => t.deadline === calSel);
    const items = bl.map(b => `<div class="item"><div class="item-main"><b>${esc(b.name)}</b><span class="muted">Bill due · ${esc((S.categories?.[b.catId] || {}).name || "—")}</span></div><div class="item-right"><b>${fmt(b.amount)}</b><button class="btn primary tiny" data-act="payBill" data-id="${b.id}">Mark paid</button></div></div>`).join("")
      + gl.map(t => `<div class="item"><div class="item-main"><b>${esc(t.name)}</b><span class="muted">Target deadline</span></div><div class="item-right"><b>${fmt(targetProgress(t))} of ${fmt(+t.goal || 0)}</b></div></div>`).join("")
      + tl.map(t => `<div class="item"><div class="item-main"><b>${esc(t.note || catLabel(t).split(" › ")[0])}</b><span class="muted">${esc(catLabel(t))}</span></div><div class="item-right"><b class="${t.type === "income" ? "pos" : "neg"}">${t.type === "income" ? "+" : "−"}${fmt(t.amount)}</b></div></div>`).join("");
    box.innerHTML = `<div class="card-head" style="margin-bottom:12px"><h3>${fdate(calSel)}${calSel === now ? " · Today" : ""}</h3><div class="row"><button class="btn ghost tiny" data-act="calAddInc" data-date="${calSel}">+ Income</button><button class="btn primary tiny" data-act="calAddExp" data-date="${calSel}">− Expense</button></div></div>`
      + (items || `<div class="empty" style="background:#fff">Nothing on this day.</div>`);
  }

  const url = settings().calendarUrl || "";
  if (!url) calView = "budget";
  $("#calExtBtn").hidden = !url;
  $("#calOpen").hidden = !url || calView !== "ext";
  $("#calBudget").hidden = calView !== "budget";
  $("#calExt").hidden = calView !== "ext";
  $$("#calSeg [data-v]").forEach(b => b.classList.toggle("active", b.dataset.v === calView));
  if (url) {
    $("#calOpen").href = url;
    const fr = $("#calFrame");
    if (calView === "ext" && fr.getAttribute("src") !== url) fr.src = url;
  }
}

/* ============ RENDER: manage tabs ============ */
function renderManage() {
  renderCategories(); renderFilters(); renderTxTable(); renderBills(); renderTargets();
  if (!$("#settingsBox").contains(document.activeElement)) renderSettings();
}

function renderCategories() {
  const m = today().slice(0, 7), list = cats();
  $("#catGrid").innerHTML = list.length ? list.map((c, i) => {
    const sp = spendOf(m, c.id), b = +c.budget || 0, col = PALETTE[i % PALETTE.length];
    return `<article class="cat-card">
      <div class="cat-top"><div class="badge" style="background:linear-gradient(135deg,${col},#93c5fd)">${esc(c.name.trim().charAt(0).toUpperCase())}</div>
        <div><h4>${esc(c.name)}</h4><span class="tag soft">${c.kind === "savings" ? "Savings pot" : "Spending"}</span></div>
        ${rowActions("Cat", c.id, `<button class="icon-btn" title="Add transaction" data-act="addTxCat" data-id="${c.id}">${ICON.plus}</button>`)}</div>
      <div class="meter-row" style="margin:0"><div class="meter-top"><span>This month</span><span>${fmt(sp)}${b ? " of " + fmt(b) : ""}</span></div>${b ? barHTML(sp / b * 100, sp > b) : `<div class="muted">No budget target set</div>`}</div>
      <ul class="subs">${c.subList.map(s => `<li>${esc(s.name)}<span class="amt">${fmt(spendOf(m, c.id, s.id))}</span>
        <button class="icon-btn" title="Edit" data-act="editSub" data-cat="${c.id}" data-id="${s.id}">${ICON.edit}</button>
        <button class="icon-btn" title="Delete" data-act="delSub" data-cat="${c.id}" data-id="${s.id}">${ICON.del}</button></li>`).join("") || `<li class="muted" style="background:transparent;padding-left:2px">No sub-categories yet</li>`}</ul>
      <button class="btn ghost small" data-act="addSub" data-id="${c.id}">+ Add sub-category</button>
    </article>`;
  }).join("") : `<div class="empty" style="grid-column:1/-1">No categories yet.</div>`;
}

function fillSelect(el, opts) {
  const prev = el.value;
  el.innerHTML = opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("");
  el.value = opts.some(o => o[0] === prev) ? prev : opts[0][0];
}
function renderFilters() {
  fillSelect($("#fCat"), [["", "All categories"], ["__income", "Income only"], ...cats().map(c => [c.id, c.name])]);
  const ms = [...new Set(txs().map(t => t.date.slice(0, 7)).filter(Boolean))].sort().reverse();
  fillSelect($("#fMonth"), [["", "All time"], ...ms.map(x => [x, monthLabel(x)])]);
  F.cat = $("#fCat").value; F.month = $("#fMonth").value;
}
function renderTxTable() {
  const q = F.q.trim().toLowerCase();
  const list = txs().filter(t =>
    (!F.month || t.date.startsWith(F.month)) &&
    (!F.cat || (F.cat === "__income" ? (t.type === "income" && !t.catId) : t.catId === F.cat)) &&
    (!q || (t.note || "").toLowerCase().includes(q) || catLabel(t).toLowerCase().includes(q)));
  $("#tblTx").innerHTML = list.length ? list.map(t => `<tr>${txRowCells(t)}<td>${rowActions("Tx", t.id)}</td></tr>`).join("")
    : `<tr><td colspan="5"><div class="empty" style="margin:6px">No transactions match.</div></td></tr>`;
  const inn = list.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const out = list.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  $("#txFoot").innerHTML = `<span>${list.length} shown</span><span>In: <b class="pos">${fmt(inn)}</b></span><span>Out: <b class="neg">${fmt(out)}</b></span><span>Net: <b>${fmt(inn - out)}</b></span>`;
}

function renderBills() {
  const list = bills();
  $("#tblBills").innerHTML = list.length ? list.map(b => `<tr><td><b>${esc(b.name)}</b></td><td><span class="tag">${esc((S.categories?.[b.catId] || {}).name || "—")}${b.subId && S.categories?.[b.catId]?.subs?.[b.subId] ? " › " + esc(S.categories[b.catId].subs[b.subId].name) : ""}</span></td>
    <td>${fdate(b.due)} <span class="muted">· ${dueLabel(b.due)}</span></td><td><span class="tag soft">${{ none: "Once", weekly: "Weekly", monthly: "Monthly" }[b.repeat || "none"]}</span></td><td class="r neg">${fmt(b.amount)}</td>
    <td>${rowActions("Bill", b.id, `<button class="btn primary tiny" data-act="payBill" data-id="${b.id}">Mark paid</button>`)}</td></tr>`).join("")
    : `<tr><td colspan="6"><div class="empty" style="margin:6px">No bills yet — add your loan, rent or subscriptions.</div></td></tr>`;
}
function renderTargets() {
  const list = targets();
  $("#targetGrid").innerHTML = list.length ? list.map(t => {
    const p = targetProgress(t), g = +t.goal || 1, pct = Math.min(100, Math.round(p / g * 100));
    const linked = t.catId && S.categories?.[t.catId];
    return `<article class="cat-card"><div class="cat-top"><div><h4>${esc(t.name)}</h4><span class="tag soft">${linked ? "Auto: " + esc(linked.name) : "Manual"}${t.deadline ? " · by " + fdate(t.deadline) : ""}</span></div>${rowActions("Target", t.id)}</div>
      <div class="meter-row" style="margin:0"><div class="meter-top"><span>${pct}%</span><span>${fmt(p)} of ${fmt(g)}</span></div>${barHTML(pct)}</div>
      <div class="muted">${fmt(Math.max(0, g - p))} to go</div>
      <button class="btn ghost small" data-act="progTarget" data-id="${t.id}">+ Add progress</button></article>`;
  }).join("") : `<div class="empty" style="grid-column:1/-1">No targets yet.</div>`;
}

function renderSettings() {
  const s = settings();
  $("#settingsBox").innerHTML = `
    <form class="card" id="settingsForm">
      <div class="card-head"><div><h2>Basics</h2><span class="muted">Names, currency and calendar link are shared by both pages. Starting money is only for ${esc(nameOf(OWNER))}'s page.</span></div></div>
      <div class="form-grid">
        <label class="fld"><span>Partner 1 name</span><input name="nameA" value="${esc(s.nameA || "")}" placeholder="Partner 1"></label>
        <label class="fld"><span>Partner 2 name</span><input name="nameB" value="${esc(s.nameB || "")}" placeholder="Partner 2"></label>
        <label class="fld"><span>Currency symbol</span><input name="currency" value="${esc(s.currency || "₱")}" maxlength="4"></label>
        <label class="fld"><span>Starting money (this page only)</span><input name="opening" type="number" step="0.01" value="${esc(s.opening ?? 0)}"></label>
        <label class="fld" style="grid-column:1/-1"><span>My calendar link (optional)</span><input name="calendarUrl" type="url" value="${esc(s.calendarUrl || "")}" placeholder="https://calendar.google.com/calendar/embed?src=..."><small>Shows a “My calendar” tab on the Overview. Leave empty to remove it.</small></label>
      </div>
      <div class="modal-actions" style="margin-top:18px"><button class="btn primary">Save settings</button></div>
    </form>
    <div class="card">
      <div class="card-head"><div><h2>Household code</h2><span class="muted">Both of you use the same code, each on your own page.</span></div></div>
      <div class="row"><code>${esc(code)}</code><button class="btn ghost small" data-act="copyCode">Copy</button><button class="btn ghost small" data-act="switchHome">Use a different code</button></div>
    </div>
    <div class="card">
      <div class="card-head"><div><h2>Backup</h2><span class="muted">Only ${esc(nameOf(OWNER))}'s budget is exported or restored from this page.</span></div></div>
      <div class="row"><button class="btn ghost small" data-act="exportCsv">Export transactions (CSV)</button><button class="btn ghost small" data-act="exportJson">Backup my budget (JSON)</button><button class="btn ghost small" data-act="restore">Restore backup…</button></div>
    </div>`;
}

/* ============ EVENTS ============ */
document.addEventListener("submit", async e => {
  if (e.target.id !== "settingsForm") return;
  e.preventDefault();
  const v = Object.fromEntries(new FormData(e.target));
  let cal = (v.calendarUrl || "").trim();
  if (cal && !/^https:\/\//i.test(cal)) { toast("Calendar link must start with https://"); cal = settings().calendarUrl || ""; }
  await patch("settings", { nameA: v.nameA.trim(), nameB: v.nameB.trim(), currency: v.currency.trim() || "₱", opening: r2(v.opening), calendarUrl: cal });
  toast("Settings saved");
});
document.addEventListener("change", async e => {
  if (e.target.id !== "restoreFile") return;
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (typeof data !== "object" || data === null) throw new Error("bad");
    if (!(await confirmBox(`This replaces ${nameOf(OWNER)}'s budget with the backup file.`, "Restore"))) return;
    await run(() => set(ref(db, `households/${code}/people/${OWNER}`), data));
    setIn(R, "people/" + OWNER, data); view(); render(); toast("Backup restored");
  } catch (err) { toast("That file couldn't be read"); }
});
$("#fQ").addEventListener("input", e => { F.q = e.target.value; renderTxTable(); });
$("#fCat").addEventListener("change", e => { F.cat = e.target.value; renderTxTable(); });
$("#fMonth").addEventListener("change", e => { F.month = e.target.value; renderTxTable(); });
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-tab]"); if (!b) return;
  $$("#tabs button").forEach(x => x.classList.toggle("active", x === b));
  $$(".tab").forEach(x => x.classList.toggle("active", x.id === "tab-" + b.dataset.tab));
  localStorage.setItem("bt_tab_" + OWNER, b.dataset.tab);
  window.scrollTo({ top: 0 });
});
{ const saved = localStorage.getItem("bt_tab_" + OWNER); if (saved) { const b = $(`#tabs [data-tab="${saved}"]`); if (b) b.click(); } }

/* ============ BOOT ============ */
async function boot() {
  setStatus("connecting");
  if (!code) {
    const v = await askForm({
      title: "Welcome to your budget", submit: "Continue", locked: true,
      note: "Pick a secret household code — a phrase only the two of you know. You both type the same code, each on your own page, and your money stays separate.",
      fields: [{ k: "code", label: "Household code", required: true, placeholder: "e.g. our-little-nest-2026" }]
    });
    code = v.code.trim().replace(/[.#$\[\]\/]/g, "-");
    localStorage.setItem("bt_code", code);
  }
  try {
    R = (await get(root())).val() || {};
    const wasEmpty = !Object.keys(R).length;
    const up = {};
    // one-time move of the old single shared budget into Partner 1's page
    const legacy = R.categories || R.transactions || R.bills || R.targets;
    if (legacy && !(R.people && R.people.a)) {
      up["people/a/categories"] = R.categories ?? null;
      up["people/a/transactions"] = R.transactions ?? null;
      up["people/a/bills"] = R.bills ?? null;
      up["people/a/targets"] = R.targets ?? null;
      up["people/a/opening"] = +(R.settings && R.settings.opening) || 0;
      up["people/a/meta/seeded"] = true;
      ["categories", "transactions", "bills", "targets", "meta"].forEach(k => { up[k] = null; });
      up["settings/opening"] = null;
    }
    if (!R.settings && !("settings/opening" in up)) up.settings = { currency: "₱", nameA: "Partner 1", nameB: "Partner 2" };
    const seeded = (up["people/a/meta/seeded"] && OWNER === "a") || (((R.people || {})[OWNER] || {}).meta || {}).seeded;
    if (!seeded) {
      const categories = {};
      SEED.forEach(([name, kind, subs], i) => {
        const subObj = {}; subs.forEach((n, j) => { subObj[uid() + j] = { name: n, order: j }; });
        categories["c" + uid() + i] = { name, kind, budget: 0, order: i, subs: subObj };
      });
      up[`people/${OWNER}/categories`] = categories;
      up[`people/${OWNER}/opening`] = 0;
      up[`people/${OWNER}/meta/seeded`] = true;
    }
    if (Object.keys(up).length) {
      await update(root(), up);
      Object.entries(up).forEach(([k, v]) => setIn(R, k, v));
    }
    if (wasEmpty) toast(`Started a NEW budget for code “${code}”. If you expected your saved data, this code doesn't match the other device — tap the code at the top to change it.`, 9000);
    setStatus("ok");
  } catch (e) {
    setStatus("error");
    toast("Can't reach Firebase — check the database rules and your internet");
  }
  view(); ready = true; render(); listen();
}
boot();
})();
