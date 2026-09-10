# Development

To be completed as the project develops.

## Deferred work tracking

- Phase 4 (institutions): automated tests deferred until after Phase 5
  (auth) exists, since these routes need auth/role protection added
  anyway and we'd otherwise test-then-immediately-rewrite. Must add
  tests covering create/list/update/validation/error-handling before
  Phase 4 is considered fully complete.
- Phase 4 routes are currently open with no authentication or
  authorization — must be locked to ADMIN/SUPER_ADMIN role once
  Phase 5 + Phase 10 (RBAC) exist.

- Rate limiting (`@fastify/rate-limit`) currently uses in-memory
  storage — discovered during Phase 5 testing that a server restart
  resets all rate-limit counters. This is fine for single-instance
  dev, but will not work correctly if the API ever runs as multiple
  instances behind a load balancer (each instance would track its
  own separate limits). Needs a shared store (e.g. Redis) before any
  horizontally-scaled production deployment.
