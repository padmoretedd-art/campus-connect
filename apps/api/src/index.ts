import Fastify from "fastify";
import { institutionRoutes } from "./routes/institutions.js";

const app = Fastify({
  logger: true,
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

  // Prisma known-error codes: https://www.prisma.io/docs/orm/reference/error-reference
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

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen({ port: PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
