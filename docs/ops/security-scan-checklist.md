# Delivery Security Scan Checklist

This checklist is for delivery rehearsals before connecting to the real control board.

## Baseline

- Confirm `.env` is not committed.
- Set a long random `JWT_SECRET`.
- Keep `CONTROL_BOARD_DRY_RUN=true` until field TCP host/port are confirmed.
- Keep `CONTROL_BOARD_LIVE_APPROVED=false` until hardware-owner approval for live TCP command testing is recorded.
- Confirm Nginx is the browser entrypoint: `http://<PUBLIC_HOST>:<NGINX_PORT>`.
- Confirm `CORS_ORIGINS` contains only trusted operator UI origins.
- Confirm `AUTH_COOKIE_SECURE=true` when HTTPS/TLS is used and `AUTH_COOKIE_SAMESITE` matches the delivery topology; `AUTH_COOKIE_SAMESITE=none` forces Secure cookies.
- Confirm cookie-authenticated mutation APIs require `X-CSRF-Token` matching the readable CSRF cookie.
- Confirm `AUTH_RATE_LIMIT_*`, `MUTATION_RATE_LIMIT_*`, and `JSON_BODY_LIMIT` match the field network policy.
- Set `DEVICE_INGEST_API_KEY` before delivery if the lidar PC and bridge program can send `X-Device-Key`.
- Confirm `NGINX_WRONGWAY_RATE_LIMIT` and `NGINX_WRONGWAY_BURST` match the lidar PC event rate.
- Confirm `NGINX_CONTENT_SECURITY_POLICY` permits the final camera/lidar media hosts while keeping `script-src 'self'` and `object-src 'none'`.
- Restrict `NGINX_SWAGGER_ALLOW` to the operator/internal network CIDR before delivery if Swagger must not be visible to all internal clients.

## Required Commands

```bash
npm run verify:audit-policy
npm run verify:security-runtime
npm run ci
npm --prefix dashboard/dashboard-web run lint
docker compose config --quiet
```

Windows PowerShell:

```powershell
npm.cmd run verify:audit-policy
npm.cmd run verify:security-runtime
npm.cmd run ci
npm.cmd --prefix dashboard/dashboard-web run lint
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

Windows evidence script:

```powershell
npm.cmd run security:evidence
npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --target-url=http://localhost:8080
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/security-scan.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/security-scan.ps1 -IncludeContainerImages -IncludeZap -RequireScanners
```

The Node evidence script is the preferred cross-platform path. It writes
`manifest.md`, `manifest.json`, operator/host metadata, optional scanner tool
inventory, raw command logs, skipped-check reasons, and acceptance
classifications (`통과`, `차단`, `납품 전 수정`, `위험 수용`, `미검증`) under
`artifacts/security/`. Set `SECURITY_EVIDENCE_OPERATOR` before running it when
the handover package must show the field reviewer name. The PowerShell script
remains available for Windows field rehearsals.

Review the `Scanner Closeout Matrix` in `manifest.md` before field sign-off.
Each gitleaks, Trivy filesystem, Trivy image, and OWASP ZAP row must either
show `EVIDENCE_READY`, show documented `RISK_ACCEPTED`, or have an owner and
recheck date in `artifacts/manual/field-risk-acceptance.md`.

Use `--require-scanners` or `-RequireScanners` during strict field acceptance
when skipped gitleaks, Trivy, or OWASP ZAP checks should become `차단` evidence
instead of being recorded as review-only `미검증` skipped items.
When a scanner skip is intentionally accepted for delivery, fill
`docs/ops/field-risk-acceptance-template.md` and attach the field copy as
`artifacts/manual/field-risk-acceptance.md` with the reviewer, compensating
control, owner, and recheck date.
The `artifacts/` directory is intentionally ignored by Git.

## Notes

- Do not run active DAST or fuzzing against the real integrated control board.
- Swagger may remain enabled during internal test; restrict or remove external access before delivery if the network is not fully trusted.
- API mutation endpoints should return `429` after rate-limit thresholds, including the Nginx `/api/wrongway` ingest limiter, and `415` for non-JSON mutation requests.
- `npm run verify:security-runtime` checks Express security headers, non-JSON mutation rejection, and login rate limiting without touching the field DB or hardware.
- Record all skipped checks with the reason, tool version, date, and operator.
