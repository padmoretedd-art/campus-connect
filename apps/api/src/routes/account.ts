import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { prisma } from "@campus-connect/database";
import { requireAuth } from "../lib/auth.js";

const changePasswordSchema = {
  body: {
    type: "object",
    required: ["currentPassword", "newPassword"],
    additionalProperties: false,
    properties: {
      currentPassword: { type: "string", minLength: 1, maxLength: 128 },
      newPassword: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
};

const deactivateSchema = {
  body: {
    type: "object",
    required: ["password"],
    additionalProperties: false,
    properties: {
      password: { type: "string", minLength: 1, maxLength: 128 },
    },
  },
};

export async function accountRoutes(app: FastifyInstance) {
  app.post(
    "/account/change-password",
    { schema: changePasswordSchema, preHandler: requireAuth },
    async (request, reply) => {
      if (!request.currentUser) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required.",
          requestId: request.id,
        });
      }

      const { currentPassword, newPassword } = request.body as {
        currentPassword: string;
        newPassword: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: request.currentUser.id },
      });

      if (!user) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required.",
          requestId: request.id,
        });
      }

      const currentPasswordValid = await argon2
        .verify(user.passwordHash, currentPassword)
        .catch(() => false);

      if (!currentPasswordValid) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Current password is incorrect.",
          requestId: request.id,
        });
      }

      const newPasswordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
      });

      // Changing password also revokes every other existing session
      // except the one making this request, so the user stays logged
      // in here while any other device/attacker session is kicked out.
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newPasswordHash },
        }),
        prisma.session.updateMany({
          where: {
            userId: user.id,
            revokedAt: null,
            tokenHash: { not: request.currentSessionTokenHash },
          },
          data: { revokedAt: new Date() },
        }),
      ]);

      return reply.code(200).send({ message: "Password changed successfully." });
    },
  );

  app.post(
    "/account/deactivate",
    { schema: deactivateSchema, preHandler: requireAuth },
    async (request, reply) => {
      if (!request.currentUser) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required.",
          requestId: request.id,
        });
      }

      const { password } = request.body as { password: string };

      const user = await prisma.user.findUnique({
        where: { id: request.currentUser.id },
      });

      if (!user) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Authentication required.",
          requestId: request.id,
        });
      }

      const passwordValid = await argon2
        .verify(user.passwordHash, password)
        .catch(() => false);

      if (!passwordValid) {
        return reply.code(401).send({
          error: "Unauthorized",
          message: "Password is incorrect.",
          requestId: request.id,
        });
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { isActive: false },
        }),
        prisma.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);

      reply.clearCookie("session_token", { path: "/" });

      return reply.code(200).send({ message: "Account deactivated." });
    },
  );
}
