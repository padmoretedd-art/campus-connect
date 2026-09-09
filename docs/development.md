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
