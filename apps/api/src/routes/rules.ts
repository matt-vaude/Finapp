import { FastifyInstance } from "fastify";
import { prisma } from "../db";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

export function registerRuleRoutes(app: FastifyInstance) {
  // Liste des règles
  app.get("/rules", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    return prisma.rule.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  });

  // Créer une règle: pattern + categoryId
  app.post("/rules", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const { pattern, categoryId } = req.body as any;

    if (!pattern || !categoryId) {
      return { error: "pattern et categoryId requis" };
    }

    return prisma.rule.create({
      data: { userId, pattern: String(pattern), categoryId: String(categoryId) },
    });
  });

  // Désactiver une règle
  app.patch("/rules/:id/toggle", async (req, reply) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const id = (req.params as any).id as string;

    const rule = await prisma.rule.findFirst({ where: { id, userId } });
    if (!rule) return reply.code(404).send({ error: "Not found" });

    return prisma.rule.update({
      where: { id },
      data: { isEnabled: !rule.isEnabled },
    });
  });

  // Supprimer une règle
  app.delete("/rules/:id", async (req, reply) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const id = (req.params as any).id as string;

    const rule = await prisma.rule.findFirst({ where: { id, userId } });
    if (!rule) return reply.code(404).send({ error: "Not found" });

    await prisma.rule.delete({ where: { id } });
    return { ok: true };
  });

  // Appliquer les règles sur les transactions sans catégorie (optionnel: month=YYYY-MM)
  app.post("/rules/apply", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const month = (req.query as any)?.month as string | undefined;

    const rules = await prisma.rule.findMany({
      where: { userId, isEnabled: true },
      orderBy: { createdAt: "desc" },
    });

    if (rules.length === 0) return { ok: true, updated: 0 };

    const whereTx: any = { account: { userId }, categoryId: null };
    if (month) {
      const { start, end } = monthRange(month);
      whereTx.date = { gte: start, lt: end };
    }

    const txs = await prisma.transaction.findMany({
      where: whereTx,
      select: { id: true, label: true },
      take: 5000,
    });

    let updated = 0;

    for (const t of txs) {
      const labelUpper = (t.label ?? "").toUpperCase();

      const matched = rules.find((r) => labelUpper.includes(r.pattern.toUpperCase()));
      if (!matched) continue;

      await prisma.transaction.update({
        where: { id: t.id },
        data: { categoryId: matched.categoryId },
      });
      updated++;
    }

    return { ok: true, updated };
  });
}
