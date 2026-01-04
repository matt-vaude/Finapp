import { FastifyInstance } from "fastify";
import { prisma } from "../db";

export function registerCategoryRoutes(app: FastifyInstance) {
  app.get("/categories", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    return prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } });
  });

  app.post("/categories", async (req) => {
    const { sub: userId } = await (req as any).jwtVerify();
    const { name } = req.body as any;
    return prisma.category.create({ data: { userId, name } });
  });
}
