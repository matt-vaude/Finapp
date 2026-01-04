import { FastifyInstance } from "fastify";
import { prisma } from "../db";

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthStart(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function registerTimeseriesRoutes(app: FastifyInstance) {
  app.get("/timeseries/cashflow", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const months = Number((req.query as any).months ?? 12);

    const end = new Date();
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1), 1));

    const tx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lte: end } },
      select: { date: true, amount: true },
    });

    const agg: Record<string, { income: number; expense: number }> = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (months - 1 - i), 1));
      agg[monthKey(d)] = { income: 0, expense: 0 };
    }

    for (const t of tx) {
      const k = monthKey(new Date(t.date));
      if (!agg[k]) continue;
      const a = Number(t.amount);
      if (a >= 0) agg[k].income += a;
      else agg[k].expense += Math.abs(a);
    }

    const series = Object.entries(agg).map(([month, v]) => ({
      month,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

    return { months, series };
  });
}
