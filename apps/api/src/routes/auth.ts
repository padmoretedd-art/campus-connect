import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { prisma } from "@campus-connect/database";
import { generateToken, hashToken } from "../lib/tokens.js";

const registerSchema = {
  body: {
    type: "object",
    required: [
      "fullName",
      "email",
      "password",
      "institutionId",
      "course",
      "yearOfStudy",
    ],
    additionalProperties: false,
    properties: {
      fullName: { type: "string", minLength: 1, maxLength: 200 },
      email: { type: "string", format: "email", maxLength: 254 },
      password: { type: "string", minLength: 8, maxLength: 128 },
      institutionId: { type: "string", format: "uuid" },
      course: { type: "string", minLength: 1, maxLength: 200 },
      yearOfStudy: { type: "integer", minimum: 1, maximum: 10 },
    },
  },
};

const verifyEmailSchema = {
  body: {
    type: "object",
    required: ["token"],
    additionalProperties: false,
    properties: {
      token: { type: "string", minLength: 1, maxLength: 256 },
    },
  },
};

const forgotPasswordSchema = {
  body: {
    type: "object",
    required: ["email"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email", maxLength: 254 },
    },
  },
};

const resetPasswordSchema = {
  body: {
    type: "object",
    required: ["token", "newPassword"],
    additionalProperties: false,
    properties: {
      token: { type: "string", minLength: 1, maxLength: 256 },
      newPassword: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
};

function extractDomain(email: string): string {
  const parts = email.toLowerCase().split("@");
  return parts.length === 2 ? parts[1] : "";
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", { schema: registerSchema }, async (request, reply) => {
    const { fullName, email, password, institutionId, course, yearOfStudy } =
      request.body as {
        fullName: string;
        email: string;
        password: string;
        institutionId: string;
        course: string;
        yearOfStudy: number;
      };

    const normalizedEmail = email.toLowerCase();
    const domain = extractDomain(normalizedEmail);

    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      include: { emailDomains: true },
    });

    if (!institution || !institution.isActive) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Selected institution is not available.",
        requestId: request.id,
      });
    }

    const domainBelongsToInstitution = institution.emailDomains.some(
      (d) => d.domain.toLowerCase() === domain,
    );

    if (!domainBelongsToInstitution) {
      return reply.code(400).send({
        error: "Bad Request",
        message:
          "Your email domain is not approved for the selected institution.",
        requestId: request.id,
      });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return reply.code(200).send({
        message:
          "If this email is eligible, a verification link has been sent.",
      });
    }

    const user = await prisma.user.create({
      data: {
        fullName,
        email: normalizedEmail,
        passwordHash,
        course,
        yearOfStudy,
        institutionId,
      },
    });

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    request.log.info(
      { userId: user.id, verificationToken: rawToken },
      "DEVELOPMENT MODE: email verification token (would be emailed)",
    );

    return reply.code(201).send({
      message:
        "If this email is eligible, a verification link has been sent.",
    });
  });

  app.post(
    "/auth/verify-email",
    { schema: verifyEmailSchema },
    async (request, reply) => {
      const { token } = request.body as { token: string };
      const tokenHash = hashToken(token);

      const genericError = () =>
        reply.code(400).send({
          error: "Bad Request",
          message: "This verification link is invalid or has expired.",
          requestId: request.id,
        });

      const verification = await prisma.emailVerification.findUnique({
        where: { tokenHash },
      });

      if (!verification) {
        return genericError();
      }

      if (verification.usedAt) {
        return genericError();
      }

      if (verification.expiresAt < new Date()) {
        return genericError();
      }

      await prisma.$transaction([
        prisma.emailVerification.update({
          where: { id: verification.id },
          data: { usedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: verification.userId },
          data: { isEmailVerified: true },
        }),
      ]);

      return reply.code(200).send({ message: "Email verified successfully." });
    },
  );

  app.post(
    "/auth/forgot-password",
    {
      schema: forgotPasswordSchema,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const { email } = request.body as { email: string };
      const normalizedEmail = email.toLowerCase();

      const genericResponse = () =>
        reply.code(200).send({
          message:
            "If this email is registered, a password reset link has been sent.",
        });

      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user || !user.isActive) {
        return genericResponse();
      }

      const rawToken = generateToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1h

      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      request.log.info(
        { userId: user.id, resetToken: rawToken },
        "DEVELOPMENT MODE: password reset token (would be emailed)",
      );

      return genericResponse();
    },
  );

  app.post(
    "/auth/reset-password",
    { schema: resetPasswordSchema },
    async (request, reply) => {
      const { token, newPassword } = request.body as {
        token: string;
        newPassword: string;
      };
      const tokenHash = hashToken(token);

      const genericError = () =>
        reply.code(400).send({
          error: "Bad Request",
          message: "This reset link is invalid or has expired.",
          requestId: request.id,
        });

      const reset = await prisma.passwordReset.findUnique({
        where: { tokenHash },
      });

      if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
        return genericError();
      }

      const newPasswordHash = await argon2.hash(newPassword, {
        type: argon2.argon2id,
      });

      await prisma.$transaction([
        prisma.passwordReset.update({
          where: { id: reset.id },
          data: { usedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: reset.userId },
          data: { passwordHash: newPasswordHash },
        }),
        // Revoke all existing sessions: a password reset should also
        // invalidate any session an attacker may already hold.
        prisma.session.updateMany({
          where: { userId: reset.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);

      return reply
        .code(200)
        .send({ message: "Password has been reset successfully." });
    },
  );
}
