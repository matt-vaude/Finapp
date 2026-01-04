import { FastifyInstance } from "fastify";
import { prisma } from "../db";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function splitCategory(name: string | null | undefined) {
  if (!name) return { group: "Non catégorisé", sub: "Non catégorisé" };
  const parts = name.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { group: parts[0], sub: parts.slice(1).join(" / ") };
  return { group: name.trim(), sub: name.trim() };
}

function pickIncomeSource(label: string | null | undefined) {
  const s = (label ?? "").trim();
  if (!s) return "Autres revenus";
  const upper = s.toUpperCase();
  if (upper.includes("SALAIRE")) return "Salaire";
  if (upper.includes("REMBOUR")) return "Remboursement";
  if (upper.includes("VIREMENT")) return "Virement";
  if (upper.includes("DIVID")) return "Dividendes";
  return "Autres revenus";
}

// IDs uniques par couche (évite collisions + cycles)
function key(layer: string, display: string) {
  return `${layer}::${display}`;
}

export function registerCashflowRoutes(app: FastifyInstance) {
  app.get("/cashflow/sankey", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = ((req.query as any).month ?? new Date().toISOString().slice(0, 7)) as string;
    const mode = (((req.query as any).mode ?? "real") as string).toLowerCase(); // real|budget
    const incomeMode = (((req.query as any).income ?? "detail") as string).toLowerCase(); // detail|simple

    const { start, end } = monthRange(month);

    const cats = await prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    const idToName = new Map(cats.map((c) => [c.id, c.name]));

    // ======================
    // 1) INCOME (toujours réel)
    // ======================
    const incomeTx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lt: end }, amount: { gt: 0 } },
      select: { amount: true, label: true },
    });

    let incomeTotal = 0;
    const incomeSources: Record<string, number> = {};

    for (const t of incomeTx) {
      const a = Number(t.amount);
      incomeTotal += a;

      const src = incomeMode === "simple" ? "Revenus" : pickIncomeSource(t.label);
      incomeSources[src] = (incomeSources[src] ?? 0) + a;
    }

    // ======================
    // 2) EXPENSES (real/budget)
    // ======================
    let expenseTotal = 0;

    const groupTotals: Record<string, number> = {};
    const subTotals: Record<string, Record<string, number>> = {};

    if (mode === "budget") {
      const budgets = await prisma.budget.findMany({
        where: { userId, month },
        select: { categoryId: true, limitAmount: true },
      });

      for (const b of budgets) {
        const v = Math.max(0, Number(b.limitAmount));
        expenseTotal += v;

        const catName = idToName.get(b.categoryId) ?? null;
        const { group, sub } = splitCategory(catName);

        groupTotals[group] = (groupTotals[group] ?? 0) + v;
        subTotals[group] ??= {};
        subTotals[group][sub] = (subTotals[group][sub] ?? 0) + v;
      }
    } else {
      const expenseTx = await prisma.transaction.findMany({
        where: { account: { userId }, date: { gte: start, lt: end }, amount: { lt: 0 } },
        select: { amount: true, categoryId: true },
      });

      for (const t of expenseTx) {
        const abs = Math.abs(Number(t.amount));
        expenseTotal += abs;

        const catName = t.categoryId ? idToName.get(t.categoryId) : null;
        const { group, sub } = splitCategory(catName);

        groupTotals[group] = (groupTotals[group] ?? 0) + abs;
        subTotals[group] ??= {};
        subTotals[group][sub] = (subTotals[group][sub] ?? 0) + abs;
      }
    }

    // ======================
    // 3) Solde : épargne / besoin de trésorerie
    // ======================
    const delta = Math.round((incomeTotal - expenseTotal) * 100) / 100;

    const savings = Math.max(0, delta);
    // ✅ IMPORTANT : si delta < 0, ce n'est PAS un flux sortant,
    // c'est une "source" (trésorerie / épargne passée) qui finance les dépenses.
    const cashFromBuffer = Math.max(0, -delta);

    // ======================
    // 4) Build Sankey (DAG safe + équilibré)
    // ======================
    const nodesSet = new Set<string>();
    const nodes: Array<{ name: string; label: string }> = [];
    const links: Array<{ source: string; target: string; value: number }> = [];

    function addNode(nodeId: string, label: string) {
      if (nodesSet.has(nodeId)) return;
      nodesSet.add(nodeId);
      nodes.push({ name: nodeId, label });
    }

    function addLink(source: string, target: string, value: number) {
      const v = Math.round(value * 100) / 100;
      if (v <= 0) return;
      links.push({ source, target, value: v });
    }

    const ID_BUDGET = key("L1", "Budget");
    addNode(ID_BUDGET, "Budget");

    // Income sources -> Budget
    for (const [src, v] of Object.entries(incomeSources)) {
      const idSrc = key("L0", src);
      addNode(idSrc, src);
      addLink(idSrc, ID_BUDGET, v);
    }

    // ✅ Déficit => entrée Trésorerie -> Budget (au lieu de Budget -> Déficit)
    if (cashFromBuffer > 0) {
      const ID_BUFFER = key("L0", "Trésorerie / épargne passée");
      addNode(ID_BUFFER, "Trésorerie / épargne passée");
      addLink(ID_BUFFER, ID_BUDGET, cashFromBuffer);
    }

    // Budget -> Épargne (si positif)
    if (savings > 0) {
      const ID_SAVINGS = key("L4", "Épargne");
      addNode(ID_SAVINGS, "Épargne");
      addLink(ID_BUDGET, ID_SAVINGS, savings);
    }

    // Budget -> Groups
    for (const [g, v] of Object.entries(groupTotals)) {
      const idG = key("L2G", g);
      addNode(idG, g);
      addLink(ID_BUDGET, idG, v);
    }

    // Groups -> Subcats (ID unique group/sub)
    for (const [g, subs] of Object.entries(subTotals)) {
      const idG = key("L2G", g);
      for (const [s, v] of Object.entries(subs)) {
        const idS = key("L3S", `${g} / ${s}`);
        addNode(idS, s);
        addLink(idG, idS, v);
      }
    }

    // Compute node values from links (for labels)
    const inSum: Record<string, number> = {};
    const outSum: Record<string, number> = {};

    for (const l of links) {
      outSum[l.source] = (outSum[l.source] ?? 0) + l.value;
      inSum[l.target] = (inSum[l.target] ?? 0) + l.value;
    }

    const nodesWithValue = nodes.map((n) => {
      const v = Math.max(inSum[n.name] ?? 0, outSum[n.name] ?? 0);
      return { ...n, value: Math.round(v * 100) / 100 };
    });

    return {
      month,
      mode,
      totals: {
        income: Math.round(incomeTotal * 100) / 100,
        expense: Math.round(expenseTotal * 100) / 100,
        savings,
        cashFromBuffer, // ✅ nouveau champ utile (si déficit)
        net: delta,
      },
      nodes: nodesWithValue,
      links,
    };
  });
}
