/* The Ledger — UI wiring. All computation happens in engine.js, on-device.
 * Real-software behaviours: inline validation, autosaved drafts (localStorage,
 * never leaves the device), schedule-level detail, downloadable GIFI export.
 * User-entered text is only ever rendered with textContent (XSS-safe). */
import { computeReturn, checkScope, cents, fmt, CCA_CLASSES, gifiCsv } from "./engine.js";

const $ = (id) => document.getElementById(id);
const MAX = 1000000000_00; // $1B input ceiling
const DRAFT_KEY = "t2ledger.draft.v2";

/* ---------- build the four CCA asset rows ---------- */
const assetsHost = $("assets");
for (let i = 1; i <= 4; i++) {
  const d = document.createElement("details");
  d.className = "asset";
  if (i === 1) d.open = true;
  const s = document.createElement("summary");
  s.textContent = `Asset class ${i}`;
  d.appendChild(s);

  const rows = document.createElement("div");
  rows.className = "row";
  const mk = (label, id) => {
    const f = document.createElement("div");
    f.className = "field";
    const l = document.createElement("label");
    l.htmlFor = id; l.textContent = label;
    f.appendChild(l);
    let inp;
    if (id.endsWith("class")) {
      inp = document.createElement("select");
      const none = document.createElement("option");
      none.value = ""; none.textContent = "— no asset —";
      inp.appendChild(none);
      for (const [k, v] of Object.entries(CCA_CLASSES)) {
        const o = document.createElement("option");
        o.value = k; o.textContent = `Class ${k} (${Math.round(v.rate * 100)}%) — ${v.label}`;
        inp.appendChild(o);
      }
    } else {
      inp = document.createElement("input");
      inp.inputMode = "decimal"; inp.placeholder = "0.00";
      inp.dataset.money = "";
    }
    inp.id = id;
    f.appendChild(inp);
    rows.appendChild(f);
  };
  mk("CCA class", `a${i}_class`);
  mk("Opening UCC", `a${i}_ucc`);
  mk("Additions this year", `a${i}_add`);
  mk("Disposals", `a${i}_disp`);
  d.appendChild(rows);

  const chk = document.createElement("label");
  chk.className = "check";
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.id = `a${i}_empty`;
  const sp = document.createElement("span");
  sp.textContent = "No assets left in this class at year end";
  chk.append(cb, sp);
  d.appendChild(chk);
  assetsHost.appendChild(d);
}

/* ---------- drafts: autosave on this device, restore on return ---------- */
const form = $("t2form");
const saveNote = $("save_note");

function snapshot() {
  const data = {};
  for (const el of form.querySelectorAll("input, select"))
    data[el.id] = el.type === "checkbox" ? el.checked : el.value;
  return data;
}
function restore() {
  let data;
  try { data = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return; }
  if (!data) return;
  for (const [id, v] of Object.entries(data)) {
    const el = $(id);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!v; else el.value = v;
    if (id.endsWith("_class") && v) el.closest("details")?.setAttribute("open", "");
  }
  saveNote.textContent = "Draft restored — it never left this device.";
}
let saveTimer;
form.addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot()));
      const t = new Date().toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
      saveNote.textContent = `Draft saved ${t} — stored only on this device.`;
    } catch { /* storage unavailable: still fully usable */ }
  }, 400);
});
$("clear_draft").addEventListener("click", () => {
  localStorage.removeItem(DRAFT_KEY);
  form.reset();
  document.querySelectorAll(".err-msg").forEach((n) => n.remove());
  document.querySelectorAll(".invalid").forEach((n) => n.classList.remove("invalid"));
  $("result").replaceChildren();
  saveNote.textContent = "Draft cleared.";
});
restore();

/* ---------- validation (mirrors the reference engine's rules) ---------- */
function fieldError(el, msg) {
  el.closest(".field")?.classList.add("invalid");
  const m = document.createElement("div");
  m.className = "err-msg";
  m.textContent = msg;
  el.closest(".field")?.appendChild(m);
}
function parseMoneyField(el, label, errors) {
  const raw = el.value.trim().replace(/[$,\s]/g, "");
  if (raw === "") return 0;
  const n = Number(raw);
  if (!isFinite(n)) { errors.push([el, `${label}: enter a number.`]); return 0; }
  if (n < 0) { errors.push([el, `${label}: can't be negative.`]); return 0; }
  const c = cents(raw);
  if (c > MAX) { errors.push([el, `${label}: enter an amount under $1,000,000,000.`]); return 0; }
  return c;
}
function validate() {
  document.querySelectorAll(".err-msg").forEach((n) => n.remove());
  document.querySelectorAll(".invalid").forEach((n) => n.classList.remove("invalid"));
  const errors = [];
  const vals = {};

  if (!$("legal_name").value.trim())
    errors.push([$("legal_name"), "Enter your corporation's legal name."]);
  const bn = $("bn").value.trim();
  if (bn && !/^\d{9}$/.test(bn))
    errors.push([$("bn"), "Business number must be exactly 9 digits."]);
  const start = $("ty_start").value, end = $("ty_end").value;
  if (start && end && end < start)
    errors.push([$("ty_end"), "Tax year end must be on or after the start date."]);

  for (const el of form.querySelectorAll("input[data-money]")) {
    const label = el.closest(".field")?.querySelector("label")?.textContent?.trim() || el.id;
    vals[el.id] = parseMoneyField(el, label.replace(/\s*\(.*$/, ""), errors);
  }
  if (vals.closing_inv > vals.opening_inv + vals.purchases)
    errors.push([$("closing_inv"), "Closing inventory can't exceed opening inventory plus purchases."]);

  for (const [el, msg] of errors) fieldError(el, msg);
  if (errors.length) {
    errors[0][0].closest(".part")?.scrollIntoView({ behavior: "smooth", block: "start" });
    errors[0][0].focus({ preventScroll: true });
  }
  return { ok: errors.length === 0, vals };
}

/* ---------- render helpers (DOM-built, never innerHTML with user data) ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function ledgerRow(tbody, label, amountCents, opts = {}) {
  const tr = el("tr", (opts.total ? "total" : "") + (opts.sub ? " subline" : ""));
  const td0 = el("td");
  if (opts.gifi) td0.appendChild(el("span", "gifi-tag", String(opts.gifi)));
  td0.appendChild(document.createTextNode(label));
  tr.appendChild(td0);
  tr.appendChild(el("td", "amt" + (amountCents < 0 ? " neg" : ""), fmt(amountCents)));
  tbody.appendChild(tr);
}
function table(captionText) {
  const t = el("table", "ledger-table");
  t.appendChild(el("caption", "", captionText));
  const tb = document.createElement("tbody");
  t.appendChild(tb);
  return [t, tb];
}
function download(filename, text, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- main flow ---------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const result = $("result");
  result.replaceChildren();

  const { ok, vals } = validate();
  if (!ok) return;

  const scope = checkScope({
    province: $("province").value,
    dividendsReceived: $("dividends_received").checked,
    investmentIncome: $("investment_income").checked,
    associated: $("associated").checked,
    foreign: $("foreign").checked,
  });

  const sheet = el("div", "paper-sheet");

  if (scope.length) {
    const stamp = el("div", "stamp declined");
    stamp.append(el("div", "big", "RETURNED"), el("div", "small", "cannot prepare"));
    sheet.appendChild(stamp);
    sheet.appendChild(el("h3", "", "We can't do this return correctly yet"));
    sheet.appendChild(el("div", "meta", "Rather than guess, here's exactly why:"));
    const ul = el("ul", "declined-list");
    for (const r of scope) ul.appendChild(el("li", "", r));
    sheet.appendChild(ul);
    result.appendChild(sheet);
    sheet.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const corp = {
    legalName: ($("legal_name").value.trim() || "YOUR CORPORATION").toUpperCase(),
    bn: $("bn").value.trim(),
    province: $("province").value,
    tyStart: $("ty_start").value || "2025-01-01",
    tyEnd: $("ty_end").value || "2025-12-31",
  };

  const capitalAssets = [];
  for (let i = 1; i <= 4; i++) {
    const cls = $(`a${i}_class`).value;
    if (!cls) continue;
    capitalAssets.push({
      ccaClass: cls,
      openingUcc: vals[`a${i}_ucc`] || 0,
      additions: vals[`a${i}_add`] || 0,
      dispositions: vals[`a${i}_disp`] || 0,
      classEmptied: $(`a${i}_empty`).checked,
    });
  }

  const expenses = [];
  const addExp = (id, gifi, label) => { if (vals[id]) expenses.push({ gifi, label, amount: vals[id] }); };
  addExp("exp_fees", 9273, "Marketplace / selling fees");
  addExp("exp_software", 9150, "Software & subscriptions");
  addExp("exp_supplies", 9130, "Supplies");
  addExp("exp_wages", 9060, "Salaries & wages");
  addExp("exp_professional", 8860, "Professional fees");
  addExp("exp_meals", 8523, "Meals & entertainment");
  addExp("exp_govt", 8764, "Government fees");
  addExp("exp_other", 9270, "Other operating expenses");

  const r = computeReturn(corp, {
    revenue: vals.revenue, openingInv: vals.opening_inv,
    purchases: vals.purchases, closingInv: vals.closing_inv,
    expenses, cash: vals.cash,
    shareCapital: vals.share_capital || 100,
    openingRetained: vals.opening_retained,
    dividendsPaid: vals.dividends_paid,
    capitalAssets, bookAmortization: vals.book_amortization,
    mealsTotal: vals.exp_meals, openingLosses: vals.opening_losses,
    taxableCapital: vals.taxable_capital, aaii: vals.aaii,
  });

  /* stamp */
  const owes = r.total > 0;
  const stamp = el("div", "stamp" + (owes ? " owing" : ""));
  stamp.append(
    el("div", "big", owes ? fmt(r.total) : "$0 OWING"),
    el("div", "small", owes ? "estimated tax payable" : "loss / nil year — still must file"),
  );
  sheet.appendChild(stamp);

  sheet.appendChild(el("h3", "", r.corp.legalName));
  sheet.appendChild(el("div", "meta",
    `${corp.tyStart} → ${corp.tyEnd} · ${corp.province}` +
    (corp.bn ? ` · BN ${corp.bn}RC0001` : "") +
    ` · prepared ${new Date().toISOString().slice(0, 10)}`));

  /* income statement, with per-line GIFI detail */
  const [t1, b1] = table("Income statement · Schedule 125 · GIFI");
  ledgerRow(b1, "Sales", r.gifi[8299] * 100, { gifi: 8299 });
  ledgerRow(b1, "Cost of goods sold", -r.gifi[8518] * 100, { gifi: 8518 });
  ledgerRow(b1, "Gross profit", r.gifi[8519] * 100, { gifi: 8519 });
  for (const x of r.expenseLines) ledgerRow(b1, x.label, -x.amount, { gifi: x.gifi, sub: true });
  ledgerRow(b1, "Total operating expenses", -r.gifi[9367] * 100, { gifi: 9367 });
  ledgerRow(b1, r.netIncome < 0 ? "Net loss (books)" : "Net income (books)",
            r.gifi[9999] * 100, { total: true, gifi: 9999 });
  sheet.appendChild(t1);

  /* Schedule 8 — per-class CCA detail */
  if (r.schedule8.classes.length) {
    const [t8, b8] = table("Capital cost allowance · Schedule 8");
    for (const c of r.schedule8.classes) {
      ledgerRow(b8, `Class ${c.ccaClass} — CCA claimed`, c.cca, { sub: true });
      if (c.recapture) ledgerRow(b8, `Class ${c.ccaClass} — recapture (income)`, c.recapture, { sub: true });
      if (c.terminalLoss) ledgerRow(b8, `Class ${c.ccaClass} — terminal loss`, c.terminalLoss, { sub: true });
      ledgerRow(b8, `Class ${c.ccaClass} — closing UCC`, c.closingUcc, { sub: true });
    }
    ledgerRow(b8, "Total CCA", r.schedule8.cca, { total: true });
    sheet.appendChild(t8);
  }

  /* Schedule 1 — book to tax, line by line */
  if (r.schedule1.additions.length || r.schedule1.deductions.length) {
    const [ts1, bs1] = table("Book → tax reconciliation · Schedule 1");
    ledgerRow(bs1, "Net income (loss) per books", r.netIncome);
    for (const [label, amt] of r.schedule1.additions) ledgerRow(bs1, `Add: ${label}`, amt, { sub: true });
    for (const [label, amt] of r.schedule1.deductions) ledgerRow(bs1, `Deduct: ${label}`, -amt, { sub: true });
    ledgerRow(bs1, "Net income for tax purposes", r.netIncomeForTax, { total: true });
    sheet.appendChild(ts1);
  }

  /* tax computation with the actual rate math */
  const [t2, b2] = table("Tax computation · Part I");
  ledgerRow(b2, "Taxable income", r.taxable);
  for (const [label, amt] of r.taxDetail) ledgerRow(b2, label, amt, { sub: true });
  ledgerRow(b2, "Total tax payable", r.total, { total: true });
  if (r.nonCapitalLoss > 0)
    ledgerRow(b2, "Non-capital loss carryforward (Schedule 4)", r.nonCapitalLoss);
  sheet.appendChild(t2);

  /* balance sheet */
  const [t3, b3] = table("Balance sheet · Schedule 100 · GIFI");
  ledgerRow(b3, "Cash", r.gifi[1001] * 100, { gifi: 1001, sub: true });
  if (r.gifi[1120]) ledgerRow(b3, "Inventories", r.gifi[1120] * 100, { gifi: 1120, sub: true });
  if (r.gifi[1740]) ledgerRow(b3, "Capital assets (UCC)", r.gifi[1740] * 100, { gifi: 1740, sub: true });
  ledgerRow(b3, "Total assets", r.gifi[2599] * 100, { gifi: 2599 });
  ledgerRow(b3, "Due to shareholder", r.gifi[2780] * 100, { gifi: 2780 });
  ledgerRow(b3, "Share capital", r.gifi[3500] * 100, { gifi: 3500 });
  ledgerRow(b3, "Retained earnings", r.gifi[3849] * 100, { gifi: 3849 });
  ledgerRow(b3, "Total liabilities + equity", r.gifi[3640] * 100, { total: true, gifi: 3640 });
  sheet.appendChild(t3);
  sheet.appendChild(el("div", "tie " + (r.balances ? "ok" : "bad"),
    r.balances ? "✓ balances — assets equal liabilities plus equity"
               : "✗ does not balance — check your numbers"));

  /* notes */
  if (r.notes.length) {
    const n = el("div", "notes");
    for (const note of r.notes) n.appendChild(el("p", "", note));
    sheet.appendChild(n);
  }

  result.appendChild(sheet);

  /* deliverables */
  const pr = el("div", "print-row");
  const dl = el("button", "", "Download GIFI export (CSV)");
  dl.type = "button";
  dl.addEventListener("click", () => {
    const safe = r.corp.legalName.replace(/[^A-Z0-9]+/gi, "-").toLowerCase();
    download(`${safe}-${corp.tyEnd}-gifi.csv`, gifiCsv(r));
  });
  const btn = el("button", "", "Print / save PDF");
  btn.type = "button";
  btn.addEventListener("click", () => window.print());
  pr.append(dl, btn);
  result.appendChild(pr);

  const use = el("p", "use-note",
    "The GIFI export contains every line with its code — use it to key the return into " +
    "any CRA-certified T2 software, or hand it to your accountant. One-click filing " +
    "arrives once this tool is certified.");
  result.appendChild(use);

  sheet.scrollIntoView({ behavior: "smooth", block: "start" });
});
