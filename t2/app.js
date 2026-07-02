/* The Ledger — UI wiring. All computation happens in engine.js, on-device.
 * User-entered text is only ever rendered with textContent (XSS-safe). */
import { computeReturn, checkScope, cents, fmt, CCA_CLASSES } from "./engine.js";

const $ = (id) => document.getElementById(id);
const money = (id) => cents($(id).value.replace(/[$,\s]/g, ""));

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
  const mk = (label, id, isMoney = true) => {
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
      if (isMoney) inp.dataset.money = "";
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

/* ---------- render helpers (DOM-built, never innerHTML with user data) ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function ledgerRow(tbody, label, amountCents, opts = {}) {
  const tr = el("tr", opts.total ? "total" : "");
  tr.appendChild(el("td", "", label));
  const td = el("td", "amt" + (amountCents < 0 ? " neg" : ""),
                (opts.paren && amountCents > 0 ? `(${fmt(amountCents)})` : fmt(amountCents)));
  tr.appendChild(td);
  tbody.appendChild(tr);
}
function table(captionText) {
  const t = el("table", "ledger-table");
  const c = el("caption", "", captionText);
  t.appendChild(c);
  const tb = document.createElement("tbody");
  t.appendChild(tb);
  return [t, tb];
}

/* ---------- main flow ---------- */
$("t2form").addEventListener("submit", (e) => {
  e.preventDefault();
  const result = $("result");
  result.replaceChildren();

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
      openingUcc: money(`a${i}_ucc`),
      additions: money(`a${i}_add`),
      dispositions: money(`a${i}_disp`),
      classEmptied: $(`a${i}_empty`).checked,
    });
  }

  const expenses = [];
  const addExp = (id, gifi, label) => {
    const c = money(id);
    if (c) expenses.push({ gifi, label, amount: c });
  };
  addExp("exp_fees", 9273, "Marketplace / selling fees");
  addExp("exp_software", 9150, "Software & subscriptions");
  addExp("exp_supplies", 9130, "Supplies");
  addExp("exp_wages", 9060, "Salaries & wages");
  addExp("exp_professional", 8860, "Professional fees");
  addExp("exp_meals", 8523, "Meals & entertainment");
  addExp("exp_govt", 8764, "Government fees");
  addExp("exp_other", 9270, "Other operating expenses");

  const r = computeReturn(corp, {
    revenue: money("revenue"),
    openingInv: money("opening_inv"),
    purchases: money("purchases"),
    closingInv: money("closing_inv"),
    expenses,
    cash: money("cash"),
    shareCapital: money("share_capital") || 100,
    openingRetained: money("opening_retained"),
    dividendsPaid: money("dividends_paid"),
    capitalAssets,
    bookAmortization: money("book_amortization"),
    mealsTotal: money("exp_meals"),
    openingLosses: money("opening_losses"),
    taxableCapital: money("taxable_capital"),
    aaii: money("aaii"),
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
    (corp.bn ? ` · BN ${corp.bn}RC0001` : "")));

  /* income statement */
  const [t1, b1] = table("Income statement · Schedule 125");
  ledgerRow(b1, "Sales", r.gifi[8299] * 100);
  ledgerRow(b1, "Cost of goods sold", -r.gifi[8518] * 100);
  ledgerRow(b1, "Gross profit", r.gifi[8519] * 100);
  ledgerRow(b1, "Operating expenses", -r.gifi[9367] * 100);
  ledgerRow(b1, r.netIncome < 0 ? "Net loss (books)" : "Net income (books)",
            r.gifi[9999] * 100, { total: true });
  sheet.appendChild(t1);

  /* tax computation */
  const [t2, b2] = table("Tax · Schedule 1 → Part I");
  ledgerRow(b2, "Income for tax purposes", r.netIncomeForTax);
  ledgerRow(b2, "Taxable income", r.taxable);
  ledgerRow(b2, "Federal tax", r.federal);
  ledgerRow(b2, `Provincial tax (${corp.province})`, r.provincial);
  ledgerRow(b2, "Total tax payable", r.total, { total: true });
  if (r.nonCapitalLoss > 0)
    ledgerRow(b2, "Non-capital loss carryforward", r.nonCapitalLoss);
  sheet.appendChild(t2);

  /* balance sheet */
  const [t3, b3] = table("Balance sheet · Schedule 100");
  ledgerRow(b3, "Total assets", r.gifi[2599] * 100);
  ledgerRow(b3, "Due to shareholder", r.gifi[2780] * 100);
  ledgerRow(b3, "Share capital", r.gifi[3500] * 100);
  ledgerRow(b3, "Retained earnings", r.gifi[3849] * 100);
  ledgerRow(b3, "Total liabilities + equity", r.gifi[3640] * 100, { total: true });
  sheet.appendChild(t3);
  const tie = el("div", "tie " + (r.balances ? "ok" : "bad"),
    r.balances ? "✓ balances — assets equal liabilities plus equity"
               : "✗ does not balance — check your numbers");
  sheet.appendChild(tie);

  /* notes */
  if (r.notes.length) {
    const n = el("div", "notes");
    for (const note of r.notes) n.appendChild(el("p", "", note));
    sheet.appendChild(n);
  }

  result.appendChild(sheet);

  const pr = el("div", "print-row");
  const btn = el("button", "", "Print / save PDF");
  btn.type = "button";
  btn.addEventListener("click", () => window.print());
  pr.appendChild(btn);
  result.appendChild(pr);

  sheet.scrollIntoView({ behavior: "smooth", block: "start" });
});
