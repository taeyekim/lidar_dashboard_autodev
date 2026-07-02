# Delivery Security Scan Checklist

This checklist is for delivery rehearsals before connecting to the real control board.

## Baseline

- Confirm `.env` is not committed.
- Set a long random `JWT_SECRET`.
- Keep `CONTROL_BOARD_DRY_RUN=true` until field TCP host/port are confirmed.
- Confirm Nginx is the browser entrypoint: `http://<PUBLIC_HOST>:<NGINX_PORT>`.
- Confirm `CORS_ORIGINS` contains only trusted operator UI origins.
- Confirm `AUTH_RATE_LIMIT_*`, `MUTATION_RATE_LIMIT_*`, and `JSON_BODY_LIMIT` match the field network policy.

## Required Commands

```bash
npm run verify:audit-policy
npm run ci
npm --prefix dashboard/dashboard-web run lint
docker compose config --quiet
```

Keep the raw `npm audit --workspaces` output as evidence. The automated gate is
`npm run verify:audit-policy`, which fails on any finding outside the documented
Prisma development-tooling exception.

## Recommended Commands

```bash
gitleaks detect --source . --redact
trivy fs --scanners vuln,secret,misconfig .
trivy image lidar_dashboard_autodev-backend
trivy image lidar_dashboard_autodev-frontend
zap-baseline.py -t http://localhost:8080 -r zap-baseline.html
```

## Notes

- Do not run active DAST or fuzzing against the real integrated control board.
- Swagger may remain enabled during internal test; restrict or remove external access before delivery if the network is not fully trusted.
- API mutation endpoints should return `429` after rate-limit thresholds and `415` for non-JSON mutation requests.
- Record all skipped checks with the reason, tool version, date, and operator.
