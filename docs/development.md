# Development

To be completed as the project develops.

## Deferred work tracking

- Phase 4 (institutions): automated tests deferred until after Phase 5
  (auth) exists, since these routes need auth/role protection added
  anyway and we'd otherwise test-then-immediately-rewrite. Must add
  tests covering create/list/update/validation/error-handling before
  Phase 4 is considered fully complete.
- [DONE] Phase 4 institution create/update routes are now locked to
  ADMIN/SUPER_ADMIN role via requireAuth + requireRole middleware.
  Verified end-to-end: unauthenticated -> 401, authenticated STUDENT
  -> 403, authenticated ADMIN -> success. GET /institutions remains
  intentionally public (needed for the registration flow).

- Rate limiting (`@fastify/rate-limit`) currently uses in-memory
  storage — discovered during Phase 5 testing that a server restart
  resets all rate-limit counters. This is fine for single-instance
  dev, but will not work correctly if the API ever runs as multiple
  instances behind a load balancer (each instance would track its
  own separate limits). Needs a shared store (e.g. Redis) before any
  horizontally-scaled production deployment.

- There is currently no in-app way to create the first ADMIN/
  SUPER_ADMIN user (by design — no hidden backdoor per Section 35).
  Development uses packages/database/src/seedAdmin.ts to promote an
  existing registered user by email. This script is clearly marked
  DEVELOPMENT ONLY and must never be relied on in production; a real
  bootstrap/admin-invitation process is needed before Phase 22.
