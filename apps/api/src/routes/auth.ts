import { FastifyInstance } from "fastify";
import { prisma } from "../db";

export function registerAuthRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (req, reply) => {
    const { email, password } = req.body as any;
    const user = await prisma.user.create({ data: { email, password } });
    const token = await reply.jwtSign({ sub: user.id });
    return { token };
  });

  app.post("/auth/login", async (req, reply) => {
    const { email, password } = req.body as any;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.password !== password) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const token = await reply.jwtSign({ sub: user.id });
    return { token };
  });
}
