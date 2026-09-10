import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { institutionRoutes } from "./routes/institutions.js";
import { authRoutes } from "./routes/auth.js";
import { sessionRoutes } from "./routes/session.js";
import { accountRoutes } from "./routes/account.js";

const app = Fastify({
  logger: true,
});

const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  throw new Error("COOKIE_SECRET environment variable is not set.");
}

await app.register(cookie, {
  secret: cookieSecret,
});

await app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: "1 minute",
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, reqId: request.id }, "request failed");

  if (error.validation) {
    return reply.code(400).send({
      error: "Bad Request",
      message: error.message,
      requestId: request.id,
    });
  }

  const prismaCode = (error as { code?: string }).code;

  if (prismaCode === "P2002") {
    return reply.code(409).send({
      error: "Conflict",
      message: "A record with this value already exists.",
      requestId: request.id,
    });
  }

  if (prismaCode === "P2025") {
    return reply.code(404).send({
      error: "Not Found",
      message: "The requested record was not found.",
      requestId: request.id,
    });
  }

  if (error.statusCode === 429) {
    return reply.code(429).send({
      error: "Too Many Requests",
      message: "Too many requests. Please try again later.",
      requestId: request.id,
    });
  }

  return reply.code(500).send({
    error: "Internal Server Error",
    message: "Something went wrong.",
    requestId: request.id,
  });
});

app.get("/health", async () => {
  return { status: "ok", service: "campus-connect-api" };
});

app.register(institutionRoutes);
app.register(authRoutes);
app.register(sessionRoutes);
app.register(accountRoutes);

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen({ port: PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
