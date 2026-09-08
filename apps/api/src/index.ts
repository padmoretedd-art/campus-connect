import Fastify from "fastify";

const app = Fastify({
  logger: true,
});

app.get("/health", async () => {
  return { status: "ok", service: "campus-connect-api" };
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen({ port: PORT, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
