import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@campus-connect/database";
import { hashToken } from "./tokens.js";

const SESSION_COOKIE_NAME = "session_token";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: {
      id: string;
      email: string;
      role: string;
    };
    currentSessionTokenHash?: string;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const cookieValue = request.cookies[SESSION_COOKIE_NAME];

  const unauthorized = () =>
    reply.code(401).send({
      error: "Unauthorized",
      message: "Authentication required.",
      requestId: request.id,
    });

  if (!cookieValue) {
    return unauthorized();
  }

  const unsigned = request.unsignCookie(cookieValue);
  if (!unsigned.valid || !unsigned.value) {
    return unauthorized();
  }

  const tokenHash = hashToken(unsigned.value);

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    !session.user.isActive
  ) {
    return unauthorized();
  }

  request.currentUser = {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
  };
  request.currentSessionTokenHash = tokenHash;
}
