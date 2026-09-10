import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { prisma } from "@campus-connect/database";
import { generateToken, hashToken } from "../lib/tokens.js";

const SESSION_COOKIE_NAME = "session_token";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
      password: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
};

export async function sessionRoutes(app: FastifyInstance) {
  app.post(
    "/auth/login",
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };
      const normalizedEmail = email.toLowerCase();

      const genericInvalid = () =>
        reply.code(401).send({
          error: "Unauthorized",
          message: "Invalid email or password.",
          requestId: request.id,
        });

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      // Always hash-verify against something, even when no user is
      // found, to avoid a timing signal revealing whether the email
      // is registered. argon2.verify safely rejects a malformed hash.
      const hashToCheck =
        user?.passwordHash ??
        "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

      const passwordValid = await argon2
        .verify(hashToCheck, password)
        .catch(() => false);

      if (!user || !passwordValid) {
        return genericInvalid();
      }

      if (!user.isActive) {
        return genericInvalid();
      }

      if (!user.isEmailVerified) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Please verify your email before logging in.",
          requestId: request.id,
        });
      }

      const rawToken = generateToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          userAgent: request.headers["user-agent"] ?? null,
          ipAddress: request.ip,
        },
      });

      reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
        signed: true,
      });

      return reply.code(200).send({
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      });
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const cookieValue = request.cookies[SESSION_COOKIE_NAME];

    if (cookieValue) {
      const unsigned = request.unsignCookie(cookieValue);
      if (unsigned.valid && unsigned.value) {
        const tokenHash = hashToken(unsigned.value);
        await prisma.session
          .updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
          })
          .catch(() => {
            // Session already gone or invalid; logout should still succeed.
          });
      }
    }

    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return reply.code(200).send({ message: "Logged out." });
  });
}
