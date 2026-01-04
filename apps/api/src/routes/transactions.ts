import { FastifyInstance } from "fastify";
import { prisma } from "../db";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

export function registerTransactionRoutes(app: FastifyInstance) {
  app.get("/transactions", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = ((req.query as any).month ?? new Date().toISOString().slice(0, 7)) as string;

    const { start, end } = monthRange(month);

    const tx = await prisma.transaction.findMany({
      where: { account: { userId }, date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        amount: true,
        currency: true,
        label: true,
        categoryId: true,
      },
      take: 500,
    });

    return { month, items: tx };
  });

app.patch("/transactions/:id", async (req, reply) => {
  const { sub: userId } = await (req as any).jwtVerify();
  const id = (req.params as any).id as string;
  const { categoryId } = req.body as any;

  // sécurité : vérifier que la transaction appartient au user
  const tx = await prisma.transaction.findFirst({
    where: { id, account: { userId } },
    select: { id: true },
  });
  if (!tx) return reply.code(404).send({ error: "Not found" });

  return prisma.transaction.update({
    where: { id },
    data: { categoryId: categoryId ?? null },
  });
});

}
