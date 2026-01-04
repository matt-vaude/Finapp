import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { registerRuleRoutes } from "./routes/rules";


import { registerAuthRoutes } from "./routes/auth";
import { registerImportRoutes } from "./routes/imports";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerTransactionRoutes } from "./routes/transactions";
import { registerCategoryRoutes } from "./routes/categories";
import { registerTimeseriesRoutes } from "./routes/timeseries";
import { registerCashflowRoutes } from "./routes/cashflow";
import { registerAnalyticsRoutes } from "./routes/analytics";



async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: process.env.JWT_SECRET! });
  await app.register(multipart);
  

  app.get("/health", async () => ({ ok: true }));

  registerAuthRoutes(app);
  registerImportRoutes(app);
  registerDashboardRoutes(app);
  registerTransactionRoutes(app);
registerCategoryRoutes(app);
registerRuleRoutes(app);
registerTimeseriesRoutes(app);
registerCashflowRoutes(app);
registerAnalyticsRoutes(app);





  await app.listen({ port: 3000, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
