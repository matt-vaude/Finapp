import { FastifyInstance } from "fastify";
import { prisma } from "../db";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function daysInMonthUTC(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (24 * 3600 * 1000));
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function splitCategory(name: string | null | undefined) {
  if (!name) return { group: "Non catégorisé", sub: "Non catégorisé" };
  const parts = name.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { group: parts[0], sub: parts.slice(1).join(" / ") };
  return { group: name.trim(), sub: name.trim() };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function titleCase(s: string) {
  return (s ?? "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cleanLabel(raw: string) {
  let s = (raw ?? "").toString().trim();
  s = s
    .replace(/^PAIEMENT\s+(CB|PSC)\s+\d{4}\s+/i, "")
    .replace(/^PRLV\s+SEPA\s+/i, "")
    .replace(/^VIR\s+(SEPA\s+)?/i, "")
    .replace(/\s+CARTE\s+\d{2,4}\b/gi, "")
    .replace(/\s+PAYWEB\d+\b/gi, "")
    .replace(/\s{2,}/g, " ");
  return s.trim();
}

/**
 * Merchant extraction (heuristique)
 */
function merchantFromLabel(label: string | null | undefined) {
  const raw = (label ?? "").toString();
  const u = raw.toUpperCase();

  if (u.includes("AMAZON")) return "Amazon";
  if (u.includes("SPOTIFY")) return "Spotify";
  if (u.includes("OPENAI") || u.includes("CHATGPT")) return "OpenAI";
  if (u.includes("APPLE") || u.includes("COM/BILL")) return "Apple";
  if (u.includes("MICROSOFT") || u.includes("MSBILL") || u.includes("SUBSCR")) return "Microsoft";
  if (u.includes("PAYPAL")) return "PayPal";
  if (u.includes("UBR*") || u.includes("UBER")) return "Uber";
  if (u.includes("BOLT")) return "Bolt";
  if (u.includes("SFR")) return "SFR";
  if (u.includes("ORANGE")) return "Orange";
  if (u.includes("FREE")) return "Free";
  if (u.includes("IMAGINE R") || u.includes("NAVIGO") || u.includes("RATP")) return "RATP / Navigo";

  const m = raw.match(/PAIEMENT\s+(?:CB|PSC)\s+\d{4}\s+(.+?)\s+CARTE/i);
  if (m?.[1]) {
    const inside = m[1].trim();
    const parts = inside.split(/\s+/);
    const tail = parts.slice(-3).join(" ");
    return titleCase(tail.replace(/[^a-zA-Z0-9'&-]+/g, " ").trim());
  }

  const cleaned = cleanLabel(raw).replace(/[^a-zA-Z0-9'&-]+/g, " ").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) return "Inconnu";
  return titleCase(words.slice(0, clamp(words.length, 1, 3)).join(" "));
}

function lastMonths(endMonth: string, count: number) {
  const [y0, m0] = endMonth.split("-").map(Number);
  const out: string[] = [];
  let y = y0;
  let m = m0;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out.reverse();
}

export function registerAnalyticsRoutes(app: FastifyInstance) {
  /**
   * Waterfall Revenu → Épargne
   * GET /analytics/waterfall?month=YYYY-MM
   */
  app.get("/analytics/waterfall", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = ((req.query as any).month ?? new Date().toISOString().slice(0, 7)) as string;
    const { start, end } = monthRange(month);

    const cats = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const idToName = new Map(cats.map((c) => [c.id, c.name]));

    const tx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lt: end } },
      select: { amount: true, categoryId: true },
    });

    let income = 0;
    const groupExpense: Record<string, number> = {};

    for (const t of tx) {
      const a = Number(t.amount);
      if (a > 0) income += a;
      if (a < 0) {
        const catName = t.categoryId ? idToName.get(t.categoryId) : null;
        const { group } = splitCategory(catName);
        groupExpense[group] = (groupExpense[group] ?? 0) + Math.abs(a);
      }
    }

    const expenseTotal = Object.values(groupExpense).reduce((s, v) => s + v, 0);
    const net = Math.round((income - expenseTotal) * 100) / 100;

    const entries = Object.entries(groupExpense).sort((a, b) => b[1] - a[1]);
    const TOP = 8;
    const top = entries.slice(0, TOP);
    const rest = entries.slice(TOP).reduce((s, [, v]) => s + v, 0);

    const steps = [
      { name: "Revenus", value: Math.round(income * 100) / 100 },
      ...top.map(([k, v]) => ({ name: k, value: -Math.round(v * 100) / 100 })),
      ...(rest > 0 ? [{ name: "Autres dépenses", value: -Math.round(rest * 100) / 100 }] : []),
      { name: net >= 0 ? "Épargne" : "Déficit", value: net },
    ];

    return { month, income, expenseTotal, net, steps };
  });

  /**
   * Barres empilées par mois (catégories = groupes)
   * GET /analytics/stacked?endMonth=YYYY-MM&months=12
   */
  app.get("/analytics/stacked", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const endMonth = ((req.query as any).endMonth ?? new Date().toISOString().slice(0, 7)) as string;
    const months = Number((req.query as any).months ?? 12);

    const monthList = lastMonths(endMonth, clamp(months, 2, 24));

    const cats = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const idToName = new Map(cats.map((c) => [c.id, c.name]));

    const { start } = monthRange(monthList[0]);
    const { end } = monthRange(monthList[monthList.length - 1]);

    const tx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lt: end }, amount: { lt: 0 } },
      select: { amount: true, categoryId: true, date: true },
    });

    const map: Record<string, Record<string, number>> = {};
    for (const m of monthList) map[m] = {};

    for (const t of tx) {
      const m = t.date.toISOString().slice(0, 7);
      if (!map[m]) continue;
      const catName = t.categoryId ? idToName.get(t.categoryId) : null;
      const { group } = splitCategory(catName);
      map[m][group] = (map[m][group] ?? 0) + Math.abs(Number(t.amount));
    }

    const overall: Record<string, number> = {};
    for (const m of monthList) {
      for (const [g, v] of Object.entries(map[m])) {
        overall[g] = (overall[g] ?? 0) + v;
      }
    }

    const groupsSorted = Object.entries(overall)
      .sort((a, b) => b[1] - a[1])
      .map(([g]) => g);

    const TOP = 9;
    const groups = groupsSorted.slice(0, TOP);
    const hasOther = groupsSorted.length > TOP;

    const valuesByGroup: Record<string, number[]> = {};
    for (const g of groups) {
      valuesByGroup[g] = monthList.map((m) => Math.round((map[m][g] ?? 0) * 100) / 100);
    }

    if (hasOther) {
      valuesByGroup["Autres"] = monthList.map((m) => {
        const total = Object.values(map[m]).reduce((s, v) => s + v, 0);
        const topSum = groups.reduce((s, g) => s + (map[m][g] ?? 0), 0);
        return Math.round((total - topSum) * 100) / 100;
      });
    }

    return {
      endMonth,
      months: monthList,
      groups: hasOther ? [...groups, "Autres"] : groups,
      valuesByGroup,
    };
  });

  /**
   * Courbe cumulée du mois vs budget (linéaire)
   * GET /analytics/cumulative?month=YYYY-MM
   */
  app.get("/analytics/cumulative", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = ((req.query as any).month ?? new Date().toISOString().slice(0, 7)) as string;
    const { start, end } = monthRange(month);
    const days = daysInMonthUTC(month);

    const tx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lt: end }, amount: { lt: 0 } },
      select: { amount: true, date: true },
    });

    const daily: Record<string, number> = {};
    for (let d = 1; d <= days; d++) {
      daily[`${month}-${String(d).padStart(2, "0")}`] = 0;
    }

    for (const t of tx) {
      const k = ymd(t.date);
      if (daily[k] == null) continue;
      daily[k] += Math.abs(Number(t.amount));
    }

    const budgets = await prisma.budget.findMany({
      where: { userId, month },
      select: { limitAmount: true },
    });
    const totalBudget = budgets.reduce((s, b) => s + Math.max(0, Number(b.limitAmount)), 0);

    const labels: string[] = [];
    const actual: number[] = [];
    const budgetLine: number[] = [];

    let cum = 0;
    for (let d = 1; d <= days; d++) {
      const dd = String(d).padStart(2, "0");
      const key = `${month}-${dd}`;
      labels.push(dd);

      cum += daily[key] ?? 0;
      actual.push(Math.round(cum * 100) / 100);

      const expected = totalBudget * (d / days);
      budgetLine.push(Math.round(expected * 100) / 100);
    }

    return {
      month,
      totalBudget: Math.round(totalBudget * 100) / 100,
      labels,
      actual,
      budgetLine,
    };
  });

  /**
   * Bullet "Budget vs Réel" par catégorie
   * GET /analytics/budget-vs-actual?month=YYYY-MM
   */
  app.get("/analytics/budget-vs-actual", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = ((req.query as any).month ?? new Date().toISOString().slice(0, 7)) as string;
    const { start, end } = monthRange(month);

    const cats = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const idToName = new Map(cats.map((c) => [c.id, c.name]));

    const budgets = await prisma.budget.findMany({
      where: { userId, month },
      select: { categoryId: true, limitAmount: true },
    });

    const budgetByCat: Record<string, number> = {};
    for (const b of budgets) budgetByCat[b.categoryId] = Math.max(0, Number(b.limitAmount));

    const tx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lt: end }, amount: { lt: 0 } },
      select: { amount: true, categoryId: true },
    });

    const actualByCat: Record<string, number> = {};
    for (const t of tx) {
      const catId = t.categoryId;
      if (!catId) continue;
      actualByCat[catId] = (actualByCat[catId] ?? 0) + Math.abs(Number(t.amount));
    }

    const rows = Object.keys({ ...budgetByCat, ...actualByCat }).map((catId) => {
      const name = idToName.get(catId) ?? "Catégorie inconnue";
      const budget = Math.round((budgetByCat[catId] ?? 0) * 100) / 100;
      const actual = Math.round((actualByCat[catId] ?? 0) * 100) / 100;
      const ratio = budget > 0 ? Math.round((actual / budget) * 100) / 100 : null;
      return { catId, name, budget, actual, ratio };
    });

    rows.sort((a, b) => {
      const da = a.actual - a.budget;
      const db = b.actual - b.budget;
      if (db !== da) return db - da;
      return b.actual - a.actual;
    });

    return { month, items: rows.slice(0, 20) };
  });

  /**
   * Top marchands (Pareto)
   * GET /analytics/merchants?month=YYYY-MM&limit=15
   */
  app.get("/analytics/merchants", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = ((req.query as any).month ?? new Date().toISOString().slice(0, 7)) as string;
    const limit = Number((req.query as any).limit ?? 15);
    const { start, end } = monthRange(month);

    const tx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lt: end }, amount: { lt: 0 } },
      select: { amount: true, label: true },
    });

    const byMerchant: Record<string, number> = {};
    for (const t of tx) {
      const m = merchantFromLabel(t.label);
      byMerchant[m] = (byMerchant[m] ?? 0) + Math.abs(Number(t.amount));
    }

    const entries = Object.entries(byMerchant).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);

    const top = entries.slice(0, clamp(limit, 5, 30));
    const labels = top.map(([k]) => k);
    const values = top.map(([, v]) => Math.round(v * 100) / 100);

    let cum = 0;
    const cumPct = values.map((v) => {
      cum += v;
      return total > 0 ? Math.round((cum / total) * 1000) / 10 : 0;
    });

    return { month, total: Math.round(total * 100) / 100, labels, values, cumPct };
  });
}
