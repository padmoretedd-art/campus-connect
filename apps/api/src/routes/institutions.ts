import type { FastifyInstance } from "fastify";
import { prisma } from "@campus-connect/database";
import { requireAuth, requireRole } from "../lib/auth.js";

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

const createInstitutionSchema = {
  body: {
    type: "object",
    required: ["name", "county"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      county: { type: "string", minLength: 1, maxLength: 100 },
      logoUrl: { type: "string", format: "uri", maxLength: 500 },
      description: { type: "string", maxLength: 2000 },
      emailDomains: {
        type: "array",
        items: { type: "string", minLength: 3, maxLength: 253 },
        maxItems: 20,
      },
    },
  },
};

const listInstitutionsSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      page: { type: "integer", minimum: 1, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    },
  },
};

const updateInstitutionSchema = {
  params: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string", format: "uuid" } },
  },
  body: {
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      county: { type: "string", minLength: 1, maxLength: 100 },
      logoUrl: { type: "string", format: "uri", maxLength: 500 },
      description: { type: "string", maxLength: 2000 },
      isActive: { type: "boolean" },
    },
  },
};

export async function institutionRoutes(app: FastifyInstance) {
  app.post(
    "/institutions",
    {
      schema: createInstitutionSchema,
      preHandler: [requireAuth, requireRole(ADMIN_ROLES)],
    },
    async (request, reply) => {
      const { name, county, logoUrl, description, emailDomains } =
        request.body as {
          name: string;
          county: string;
          logoUrl?: string;
          description?: string;
          emailDomains?: string[];
        };

      const institution = await prisma.institution.create({
        data: {
          name,
          county,
          logoUrl,
          description,
          emailDomains: emailDomains
            ? { create: emailDomains.map((domain) => ({ domain })) }
            : undefined,
        },
        include: { emailDomains: true },
      });

      return reply.code(201).send(institution);
    },
  );

  // Publicly readable: students need to see institutions to register.
  app.get(
    "/institutions",
    { schema: listInstitutionsSchema },
    async (request) => {
      const { page = 1, pageSize = 20 } = request.query as {
        page?: number;
        pageSize?: number;
      };

      const [items, total] = await Promise.all([
        prisma.institution.findMany({
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { name: "asc" },
          include: { emailDomains: true },
        }),
        prisma.institution.count(),
      ]);

      return { items, total, page, pageSize };
    },
  );

  app.patch(
    "/institutions/:id",
    {
      schema: updateInstitutionSchema,
      preHandler: [requireAuth, requireRole(ADMIN_ROLES)],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const updates = request.body as Record<string, unknown>;

      // Let Prisma's P2025 (record not found) propagate to the central
      // error handler instead of catching it here, so the response
      // shape (including requestId) stays consistent with every other
      // route in the app.
      const institution = await prisma.institution.update({
        where: { id },
        data: updates,
        include: { emailDomains: true },
      });
      return institution;
    },
  );
}
