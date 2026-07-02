# Security Audit Results

Date: 2026-07-02

## Command

```bash
npm audit --workspaces
npm audit fix
npm audit --workspaces
```

## Result

- Initial audit found 20 vulnerabilities across frontend/server workspace dependencies.
- `npm audit fix` updated the lockfile and reduced the result to 3 moderate vulnerabilities.
- Follow-up verification passed:
  - `npm run smoke`
  - `npm run ci`
  - `npm --prefix dashboard/dashboard-web run lint`

## Remaining Findings

`npm audit --workspaces` still reports `@hono/node-server <1.19.13` through Prisma development dependencies:

- `@hono/node-server`
- `@prisma/dev`
- `prisma`

The suggested fix is `npm audit fix --force`, which would install `prisma@6.19.3` and is reported by npm as a breaking change. This project currently uses Prisma 7.x APIs and generated client behavior, so the force downgrade is not applied automatically.

## Delivery Decision

- Classification: risk accepted for current development tooling only.
- Runtime impact: no direct production route is served by `@hono/node-server` in this application.
- Next action: revisit when Prisma publishes a non-breaking 7.x patch that resolves the advisory path.
