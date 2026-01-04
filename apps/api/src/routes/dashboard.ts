import { FastifyInstance } from "fastify";
import { prisma } from "../db";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

export function registerDashboardRoutes(app: FastifyInstance) {
  app.get("/dashboard", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = ((req.query as any).month ?? new Date().toISOString().slice(0, 7)) as string;

    const { start, end } = monthRange(month);

    const tx = await prisma.transaction.findMany({
      where: {
        account: { userId },
        date: { gte: start, lt: end },
      },
      select: { amount: true, categoryId: true },
    });

    let income = 0;
    let expense = 0;
    const byCategory: Record<string, number> = {};

    for (const t of tx) {
      const a = Number(t.amount);

      if (a >= 0) income += a;
      else expense += Math.abs(a);

      if (a < 0) {
        const cat = t.categoryId ?? "uncategorized";
        byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(a);
      }
    }

    const net = income - expense;
    const saved_estimate = net > 0 ? net : 0;

    return { month, income, expense, net, saved_estimate, byCategory };
  });
}
