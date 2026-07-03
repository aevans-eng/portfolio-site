/* T2 calculation engine — client-side port of the tested Python engine
 * (side-income/t2-software-feasibility/t2_engine/). All money is integer
 * CENTS; rounding is half-up away from zero to match Python's Decimal
 * ROUND_HALF_UP. Verified against the same test vectors (engine.test.mjs).
 *
 * Everything runs in the visitor's browser. No data leaves the device.
 */

// ---------------------------------------------------------------- money
export function halfUp(x) {
  // round to integer, halves away from zero (Python ROUND_HALF_UP)
  return x < 0 ? -Math.round(-x) : Math.round(x);
}
export const cents = (v) => halfUp(Number(v || 0) * 100); // dollars -> cents
export function fmt(c, dollars = false) {
  const v = dollars ? c : c / 100;
  return v.toLocaleString("en-CA", {
    style: "currency", currency: "CAD",
    minimumFractionDigits: dollars ? 0 : 2,
    maximumFractionDigits: dollars ? 0 : 2,
  });
}
const roundDollar = (c) => halfUp(c / 100); // cents -> whole dollars

// ---------------------------------------------------------------- rates
export const FEDERAL = { sbdRate: 0.09, generalRate: 0.15, limit: 500000_00 };

// Effective-dated provincial tables (verified vs CRA/KPMG/EY 2025 tables).
// QC and AB file separate returns (CO-17/AT1) — excluded by the scope guard.
export const PROVINCIAL_RATES = {
  BC: [{ start: "2017-04-01", small: 0.02,  general: 0.12,  limit: 500000_00 }],
  SK: [{ start: "2024-07-01", small: 0.01,  general: 0.12,  limit: 600000_00 }],
  MB: [{ start: "2019-01-01", small: 0.00,  general: 0.12,  limit: 500000_00 }],
  ON: [{ start: "2020-01-01", small: 0.032, general: 0.115, limit: 500000_00 }],
  NB: [{ start: "2022-01-01", small: 0.025, general: 0.14,  limit: 500000_00 }],
  NS: [
    { start: "2020-04-01", small: 0.025, general: 0.14, limit: 500000_00 },
    { start: "2025-04-01", small: 0.015, general: 0.14, limit: 700000_00 },
  ],
  PE: [
    { start: "2024-07-01", small: 0.01, general: 0.16, limit: 500000_00 },
    { start: "2025-07-01", small: 0.01, general: 0.15, limit: 600000_00 },
  ],
  NL: [{ start: "2024-01-01", small: 0.025, general: 0.15,  limit: 500000_00 }],
  YT: [{ start: "2021-01-01", small: 0.00,  general: 0.12,  limit: 500000_00 }],
  NT: [{ start: "2021-01-01", small: 0.02,  general: 0.115, limit: 500000_00 }],
  NU: [{ start: "2019-07-01", small: 0.03,  general: 0.12,  limit: 500000_00 }],
};

const day = (s) => new Date(s + "T00:00:00Z");
const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);

function periodOn(prov, iso) {
  const ps = PROVINCIAL_RATES[prov];
  let cur = ps[0];
  for (const p of ps) { if (p.start <= iso) cur = p; else break; }
  return cur;
}

export function provincialRatesForYear(prov, start, end) {
  // Day-prorated across mid-year rate changes (CRA's method).
  if (!PROVINCIAL_RATES[prov]) throw new Error("No rate table for " + prov);
  const total = daysBetween(start, end) + 1;
  if (total <= 0) throw new Error("Tax year end before start");
  const changes = PROVINCIAL_RATES[prov]
    .map((p) => p.start).filter((s) => s > start && s <= end).sort();
  const bounds = [start, ...changes, end];
  let small = 0, general = 0;
  for (let i = 0; i < bounds.length - 1; i++) {
    const last = i === bounds.length - 2;
    const days = daysBetween(bounds[i], bounds[i + 1]) + (last ? 1 : 0);
    const p = periodOn(prov, bounds[i]);
    small += (p.small * days) / total;
    general += (p.general * days) / total;
  }
  return { small, general, limit: periodOn(prov, end).limit };
}

// ------------------------------------------------- business-limit grinds
export const PASSIVE_GRIND_NON_PARALLEL = new Set(["ON", "NB"]);
const TC_LOWER = 10000000_00, TC_UPPER = 50000000_00, AAII_T = 50000_00;

export function groundLimit(base, taxCap, aaii, applyPassive = true) {
  let tc = 0;
  if (taxCap > TC_LOWER)
    tc = taxCap >= TC_UPPER ? base : (base * (taxCap - TC_LOWER)) / (TC_UPPER - TC_LOWER);
  let pv = 0;
  if (applyPassive && aaii > AAII_T) pv = Math.min(base, (aaii - AAII_T) * 5);
  return halfUp(Math.max(0, base - Math.max(tc, pv)));
}

// ------------------------------------------------------------ Schedule 8
export const CCA_CLASSES = {
  "1":    { rate: 0.04, label: "Buildings (post-1987)" },
  "8":    { rate: 0.20, label: "Furniture, tools ≥ $500, equipment" },
  "10":   { rate: 0.30, label: "Motor vehicles" },
  "10.1": { rate: 0.30, label: "Passenger vehicles over the ceiling" },
  "12":   { rate: 1.00, label: "Tools < $500, application software" },
  "14.1": { rate: 0.05, label: "Goodwill & intangibles" },
  "16":   { rate: 0.40, label: "Taxis, rental vehicles" },
  "43":   { rate: 0.30, label: "Manufacturing & processing machinery" },
  "46":   { rate: 0.30, label: "Network equipment" },
  "50":   { rate: 0.55, label: "Computers & systems software" },
  "53":   { rate: 0.50, label: "M&P machinery (2016–2025)" },
};

export function computeSchedule8(assets, yearEndISO) {
  const yr = Number(yearEndISO.slice(0, 4));
  const out = { classes: [], cca: 0, recapture: 0, terminalLoss: 0 };
  for (const a of assets) {
    const def = CCA_CLASSES[a.ccaClass];
    if (!def) throw new Error("Unsupported CCA class " + a.ccaClass);
    const net = a.additions - a.dispositions;
    const before = a.openingUcc + net;
    let r;
    if (before < 0) {
      r = { ccaClass: a.ccaClass, cca: 0, recapture: -before, terminalLoss: 0, closingUcc: 0 };
    } else if (a.classEmptied) {
      r = { ccaClass: a.ccaClass, cca: 0, recapture: 0, terminalLoss: before, closingUcc: 0 };
    } else {
      const base = net > 0 ? (yr <= 2027 ? a.openingUcc + net : a.openingUcc + net / 2)
                           : a.openingUcc + net;
      let cca = halfUp(Math.max(0, base) * def.rate);
      cca = Math.min(cca, before);
      r = { ccaClass: a.ccaClass, cca, recapture: 0, terminalLoss: 0, closingUcc: before - cca };
    }
    out.classes.push(r);
    out.cca += r.cca; out.recapture += r.recapture; out.terminalLoss += r.terminalLoss;
  }
  return out;
}

// ------------------------------------------------------------ Schedule 1
export function computeSchedule1(accountingIncome, s1in, s8) {
  const additions = [], deductions = [];
  if (s1in.bookAmortization) additions.push(["Amortization per books", s1in.bookAmortization]);
  const halfMeals = halfUp(s1in.mealsTotal / 2);
  if (halfMeals) additions.push(["Non-deductible 50% of meals & entertainment", halfMeals]);
  if (s1in.penalties) additions.push(["Non-deductible penalties", s1in.penalties]);
  if (s8.recapture) additions.push(["Recapture of CCA", s8.recapture]);
  if (s8.cca) deductions.push(["Capital cost allowance (Schedule 8)", s8.cca]);
  if (s8.terminalLoss) deductions.push(["Terminal loss", s8.terminalLoss]);
  const net = accountingIncome
    + additions.reduce((s, [, a]) => s + a, 0)
    - deductions.reduce((s, [, a]) => s + a, 0);
  return { additions, deductions, netIncomeForTax: net };
}

// ------------------------------------------------------------ Schedule 4
export function applyLosses(income, opening) {
  if (income <= 0 || opening <= 0)
    return [income, { opening, applied: 0, closing: opening }];
  const applied = Math.min(income, opening);
  return [income - applied, { opening, applied, closing: opening - applied }];
}

// ------------------------------------------------------------ scope guard
export function checkScope(f) {
  const reasons = [];
  if (f.province === "QC" || f.province === "AB")
    reasons.push("Quebec and Alberta corporations file a separate provincial return (CO-17 / AT1) this tool doesn't produce.");
  if (f.dividendsReceived)
    reasons.push("Dividends received from other corporations need Part IV tax and RDTOH tracking (Schedule 3), not supported yet.");
  if (f.investmentIncome)
    reasons.push("Interest, investment, or rental income is taxed under the refundable-tax rules (Schedule 7), not supported yet.");
  if (f.associated)
    reasons.push("Associated corporations must allocate the shared small-business limit (Schedule 23), not supported yet.");
  if (f.foreign)
    reasons.push("Foreign income, foreign property, or non-resident ownership isn't supported.");
  return reasons;
}

// ------------------------------------------------------------ Part I tax
export function computeTax(taxable, prov, start, end, taxCap = 0, aaii = 0) {
  const pr = provincialRatesForYear(prov, start, end);
  if (taxable <= 0)
    return { federal: 0, provincial: 0, detail: [], rates: pr, fedLimit: FEDERAL.limit, provLimit: pr.limit };
  let fedLimit = FEDERAL.limit;
  let provLimit = pr.limit;
  if (taxCap > 0 || aaii > 0) {
    fedLimit = groundLimit(fedLimit, taxCap, aaii, true);
    provLimit = groundLimit(provLimit, taxCap, aaii, !PASSIVE_GRIND_NON_PARALLEL.has(prov));
  }
  const pct = (x) => (x * 100).toFixed(x * 100 % 1 ? 3 : 0).replace(/\.?0+$/, "") + "%";
  const detail = [];
  const fedLow = Math.min(taxable, fedLimit);
  const fedHigh = Math.max(0, taxable - fedLimit);
  detail.push([`Federal small-business rate ${pct(FEDERAL.sbdRate)} × ${fmt(fedLow)}`, halfUp(fedLow * FEDERAL.sbdRate)]);
  if (fedHigh) detail.push([`Federal general rate ${pct(FEDERAL.generalRate)} × ${fmt(fedHigh)}`, halfUp(fedHigh * FEDERAL.generalRate)]);
  const federal = halfUp(fedLow * FEDERAL.sbdRate + fedHigh * FEDERAL.generalRate);
  const provLow = Math.min(taxable, provLimit);
  const provHigh = Math.max(0, taxable - provLimit);
  detail.push([`${prov} lower rate ${pct(pr.small)} × ${fmt(provLow)}`, halfUp(provLow * pr.small)]);
  if (provHigh) detail.push([`${prov} higher rate ${pct(pr.general)} × ${fmt(provHigh)}`, halfUp(provHigh * pr.general)]);
  const provincial = halfUp(provLow * pr.small + provHigh * pr.general);
  return { federal, provincial, detail, rates: pr, fedLimit, provLimit };
}

// --------------------------------------------------------- GIFI deliverable
export const GIFI_LABELS = {
  1001: "Cash", 1120: "Inventories", 1740: "Machinery & equipment (UCC)",
  2599: "Total assets", 2780: "Due to shareholder(s)/director(s)",
  3500: "Common shares", 3640: "Total liabilities and shareholder equity",
  3849: "Retained earnings/deficit — end",
  8299: "Total revenue", 8518: "Cost of sales", 8519: "Gross profit",
  8523: "Meals & entertainment", 8670: "Amortization",
  8764: "Government fees", 8860: "Professional fees",
  9060: "Salaries & wages", 9130: "Supplies", 9150: "Computer expenses",
  9270: "Other expenses", 9273: "Selling expenses — marketplace fees",
  9367: "Total operating expenses", 9999: "Net income/loss after taxes",
};

export function gifiCsv(r) {
  // The filing deliverable: every GIFI line as code,label,amount — the values
  // to key into (or check against) any CRA-certified T2 software.
  const rows = [["GIFI code", "Description", "Amount (CAD, whole dollars)"]];
  const push = (code) => {
    if (r.gifi[code] !== undefined)
      rows.push([code, GIFI_LABELS[code] || `GIFI ${code}`, r.gifi[code]]);
  };
  // income statement (S125), then expense detail, then balance sheet (S100)
  [8299, 8518, 8519].forEach(push);
  for (const e of r.expenseLines || [])
    rows.push([e.gifi, GIFI_LABELS[e.gifi] || e.label, halfUp(e.amount / 100)]);
  [9367, 9999, 1001, 1120, 1740, 2599, 2780, 3500, 3849, 3640].forEach(push);
  return rows.map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

// ----------------------------------------------------------- full return
export function computeReturn(corp, fin) {
  const notes = [];

  // Schedule 8 first: closing UCC feeds the balance sheet
  const s8 = computeSchedule8(fin.capitalAssets || [], corp.tyEnd);
  const closingUcc = s8.classes.reduce((s, c) => s + c.closingUcc, 0);
  if (s8.cca) notes.push(`CCA claimed (Schedule 8): ${fmt(s8.cca)}.`);
  if (s8.recapture) notes.push(`Recapture of CCA added to income: ${fmt(s8.recapture)}.`);
  if (s8.terminalLoss) notes.push(`Terminal loss deducted: ${fmt(s8.terminalLoss)}.`);

  // income statement (books)
  const cogs = fin.openingInv + fin.purchases - fin.closingInv;
  const grossProfit = fin.revenue - cogs;
  const opexList = [...(fin.expenses || [])];
  if (fin.bookAmortization) opexList.push({ gifi: 8670, label: "Amortization", amount: fin.bookAmortization });
  const opex = opexList.reduce((s, e) => s + e.amount, 0);
  const netIncome = grossProfit - opex;

  // Schedule 1
  const s1 = computeSchedule1(netIncome, {
    bookAmortization: fin.bookAmortization || 0,
    mealsTotal: fin.mealsTotal || 0,
    penalties: fin.penalties || 0,
  }, s8);
  const nift = s1.netIncomeForTax;
  for (const [label, amt] of s1.additions)
    if (label.startsWith("Non-deductible 50%"))
      notes.push(`Added back on Schedule 1: ${label} (${fmt(amt)}).`);

  // Schedule 4
  let taxable, lossCarry;
  if (nift >= 0) {
    const [ti, app] = applyLosses(nift, fin.openingLosses || 0);
    taxable = ti; lossCarry = app.closing;
    if (app.applied) notes.push(
      `Applied ${fmt(app.applied)} of prior non-capital losses; ${fmt(app.closing)} remain.`);
  } else {
    taxable = 0;
    lossCarry = (fin.openingLosses || 0) + (-nift);
    notes.push(`Loss year: ${fmt(-nift)} current non-capital loss; total carryforward now ${fmt(lossCarry)} (Schedule 4).`);
  }

  // Part I tax (with grinds)
  const { federal, provincial, detail: taxDetail } = computeTax(
    taxable, corp.province, corp.tyStart, corp.tyEnd,
    fin.taxableCapital || 0, fin.aaii || 0);
  if ((fin.taxableCapital || 0) > 0 || (fin.aaii || 0) > 0)
    notes.push("Small-business limit adjusted for taxable capital / passive investment income (grind rules).");

  // balance sheet
  const totalAssets = fin.cash + fin.closingInv + closingUcc;
  const retainedEnd = (fin.openingRetained || 0) + netIncome - (fin.dividendsPaid || 0);
  const equity = fin.shareCapital + retainedEnd;
  const dueToShareholder = totalAssets - equity; // balancing account (owner-funded reality)
  notes.push(`Due-to-shareholder derived as the balancing figure (${fmt(dueToShareholder)}).`);

  // whole-dollar GIFI (plug absorbs ±$1 like certified software)
  const g = {
    8299: roundDollar(fin.revenue), 8518: roundDollar(cogs),
    8519: roundDollar(grossProfit), 9367: roundDollar(opex),
    9999: roundDollar(netIncome),
    1001: roundDollar(fin.cash),
    1120: roundDollar(fin.closingInv), 1740: roundDollar(closingUcc),
    2599: roundDollar(totalAssets), 3500: roundDollar(fin.shareCapital),
    3849: roundDollar(retainedEnd),
  };
  g[2780] = g[2599] - g[3500] - g[3849];
  g[3640] = g[2780] + g[3500] + g[3849];

  return {
    corp, netIncome, netIncomeForTax: nift, taxable,
    nonCapitalLoss: lossCarry, federal, provincial, total: federal + provincial,
    dueToShareholder, totalAssets, retainedEnd,
    schedule8: s8, schedule1: s1, gifi: g, notes, taxDetail,
    expenseLines: opexList,
    balances: g[2599] === g[3640],
  };
}
