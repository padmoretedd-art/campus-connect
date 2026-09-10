# Security

To be completed as the project develops.

## Known accepted risks (dev tooling)

- `npm audit` (as of Phase 3) flags `mysql2` and `deepmerge-ts` as high
  severity, pulled in transitively by the `prisma` CLI package (not
  `@prisma/client`, which is what runs in production).
  - `mysql2`: vulnerable MySQL protocol handling. We use Postgres only;
    this code path is never reached.
  - `deepmerge-ts`: stack-exhaustion DoS in `@prisma/config`, used only
    by local CLI commands (`prisma migrate`, `prisma generate`), not
    exposed to untrusted input in production.
  - `npm audit fix --force` would downgrade `prisma` from 7.10.0 to
    6.19.3, a regression, to resolve this. Declined for now.
  - Action: re-check this audit at the Phase 24 final security audit.

- `@prisma/streams-local` (transitive dep of `@prisma/dev`) warns
  requiring Node >=22 (EBADENGINE); we are pinned to Node 20 LTS.
  Non-fatal (npm install still succeeds), and we do not use Prisma's
  streams feature. Re-check when planning any future Node upgrade.

- `cookie@2.0.1` (transitive dep of `@fastify/cookie`) warns requiring
  Node >=22 (EBADENGINE). Verified it loads and functions correctly on
  Node 20.19.2 via direct require test. Unlike the Prisma streams
  warning above, this package IS in the production request path
  (cookie parsing on every request), so re-verify this specifically
  when planning any Node upgrade or before final production deploy.
