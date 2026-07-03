# Delivery Runbook

This runbook describes the field rehearsal flow for the lidar wrong-way prevention dashboard.

## 1. Preflight

- Confirm the dashboard PC, lidar PC, and integrated control board are on the expected internal network.
- Copy `.env.example` to `.env` and fill only local/field values in `.env`.
- Set a long random `JWT_SECRET`.
- Keep operator authentication on HttpOnly cookie mode; keep the readable CSRF cookie name aligned with the frontend default and set `AUTH_COOKIE_SECURE=true` when HTTPS/TLS is used.
- Set `DEVICE_INGEST_API_KEY` if the lidar PC and control-board bridge can send the `X-Device-Key` header.
- Keep `CONTROL_BOARD_DRY_RUN=true` until the TCP host/port is confirmed with the hardware owner.
- Confirm `CONTROL_BOARD_HOST`, `CONTROL_BOARD_PORT`, timeout, retry, and heartbeat values with the field network plan.
- Confirm `NGINX_WRONGWAY_RATE_LIMIT`, `NGINX_WRONGWAY_BURST`, `NGINX_CONTENT_SECURITY_POLICY`, and `NGINX_SWAGGER_ALLOW` match the field network, media host topology, and Swagger exposure policy.

## 2. Build And Start

Development-style start:

```bash
docker compose up --build
```

Delivery-style browser entrypoint through Nginx:

```bash
docker compose up --build -d
curl http://localhost:8080/healthz
```

Windows PowerShell rehearsal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/delivery-verify.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/runtime-smoke.ps1 -StartCompose -StopCompose
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl http://localhost:8080
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl http://localhost:8080
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl http://localhost:8080
npm.cmd run field:acceptance -- -BaseUrl http://localhost:8080
npm.cmd run runtime:evidence -- --run-smoke
npm.cmd run runtime:evidence -- --run-smoke --use-existing-stack --base-url=http://localhost:8080
npm.cmd run field:rehearsal-unavailable -- --reason="Docker runtime or field hardware is unavailable on this workstation"
npm.cmd run delivery:evidence
npm.cmd run completion:audit
```

Use `npm.cmd` and `curl.exe` on Windows when the local PowerShell execution
policy blocks `npm.ps1` or aliases `curl`.

For a single ordered field acceptance pass, use the orchestrator:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/field-preflight.ps1 -BaseUrl http://localhost:8080 -Reviewer "field-reviewer-name" -SiteName "delivery-site-name"
npm.cmd run field:preflight -- -BaseUrl http://localhost:8080 -Reviewer "field-reviewer-name" -SiteName "delivery-site-name"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/field-acceptance.ps1 -BaseUrl http://localhost:8080
npm.cmd run field:acceptance -- -BaseUrl http://localhost:8080 -Reviewer "field-reviewer-name" -SiteName "delivery-site-name"
```

The preflight records `.env` readiness, `JWT_SECRET`, seed admin password,
`DEVICE_INGEST_API_KEY`, `CONTROL_BOARD_DRY_RUN`, live TCP host/port,
`AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`, and `NGINX_SWAGGER_ALLOW` under
`artifacts/field-preflight/<timestamp>/manifest.json` plus `manifest.md`.
Use `-RequireDeviceKey`, `-RequireHttpsCookies`, `-RequireSwaggerAllowlist`,
and `-StrictPreflight` when those checks should fail instead of being recorded
as review/skipped items.

The orchestrator runs `scripts/field-preflight.ps1`, `scripts/delivery-verify.ps1`, `scripts/runtime-smoke.ps1`,
`scripts/db-field-rehearsal.ps1`, `scripts/lidar-ingest-rehearsal.ps1`,
`scripts/control-board-field-rehearsal.ps1`, `npm.cmd run security:evidence`,
and `npm.cmd run delivery:evidence` in order, then records
`artifacts/field-acceptance/<timestamp>/manifest.json` plus `manifest.md`.
The manifest includes a `Field Acceptance Decision` summary with `-Reviewer`,
`-SiteName`, optional `-DecisionNote`, PASS/REVIEW/SKIPPED counts, handover
readiness, and next actions for the handover package.
Use `-RunDbDeploy` and `-RunDbSeed` only after the field PostgreSQL target is
confirmed. Use `-AllowLiveTcp` only after hardware approval. Use
`-IncludeContainerImages`, `-IncludeZap`, and `-RequireScanners` for strict
security acceptance when those scanners are installed.

When the delivery Docker stack, lidar PC, field network, or control-board
hardware is not available on the current workstation, run
`npm.cmd run field:rehearsal-unavailable`. It writes
`FIELD_REHEARSAL_UNAVAILABLE` REVIEW manifests under
`artifacts/field-db-rehearsal/`, `artifacts/field-lidar-rehearsal/`, and
`artifacts/field-control-board-rehearsal/` so the handover package records why
field rehearsal is still open and which command must replace the placeholder
with a PASS manifest.

Strict field acceptance example after the delivery stack is already running:

```powershell
npm.cmd run field:acceptance -- -BaseUrl http://localhost:8080 -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -StrictPreflight -IncludeContainerImages -IncludeZap -RequireScanners
```

After `npm.cmd run delivery:evidence`, run `npm.cmd run completion:audit`.
The audit writes `artifacts/completion-audit/<timestamp>/manifest.json` and
`artifacts/completion-audit/<timestamp>/manifest.md`, then sets
`canMarkGoalComplete` to `false` until automated checks pass and no field,
companion, skipped, preflight, acceptance, or required verification item
remains.

Default URLs:

- Operator UI: `http://localhost:8080`
- Backend API through proxy: `http://localhost:8080/api/health`
- WebSocket through proxy: `ws://localhost:8080/ws`
- Swagger: `http://localhost:8080/api-docs`
- Backend direct health: `http://localhost:5000/api/health`

Nginx delivery cache policy:

- Vite hashed frontend assets under `/assets/` are served with immutable public cache headers.
- SPA entry routes remain `no-store` so new dashboard deployments are picked up without stale HTML.

## 3. Database

The backend container runs these commands on startup:

```bash
npx prisma migrate deploy
npx prisma db seed
npm start
```

Manual verification:

```bash
npm run db:status
npm run ci:db
curl http://localhost:8080/api/database/health
curl http://localhost:8080/api/status
curl http://localhost:8080/api/devices/status
```

Focused DB/Prisma field evidence:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl http://localhost:8080
```

Use `-RunDeploy` and `-RunSeed` only when the field PostgreSQL target is
confirmed for migration/seed rehearsal. The script always records `db:status`,
`/api/database/health`, `/api/status`, `/api/devices/status`, and configured
site/zone/device API results under
`artifacts/field-db-rehearsal/<timestamp>/manifest.json` plus `manifest.md`.

Field topology verification:

```bash
curl http://localhost:8080/api/sites
curl http://localhost:8080/api/zones
curl http://localhost:8080/api/devices
```

Expected:

- `sites`, `zones`, and `devices` reflect Prisma seed or field registration data.
- Empty device lists are treated as `not configured`, not as live hardware status.
- `/api/status` summarizes server, database, ingest, WebSocket, devices, and control board mode.
- Control board ingest creates `device_status_logs` and broadcasts `device-status.updated`.
- Wrong-way ingest broadcasts `traffic-event.created` and `vehicle-track.updated`; event status/memo changes broadcast `traffic-event.updated`.
- Browser WebSocket traffic uses `/ws`; Nginx must proxy that path to the backend with upgrade headers.
- Frontend hashed assets under `/assets/` use immutable caching, while SPA entry routes remain non-cacheable.

## 4. Operator Account

Seeded account values come from `.env`:

```env
SEED_ADMIN_USER_ID=admin
SEED_ADMIN_PASSWORD=replace_in_field
SEED_ADMIN_NAME=System Administrator
```

After first login, confirm:

- `/api/auth/login` sets the `lidar_dashboard_access` HttpOnly cookie and does not expose the JWT in the response body.
- `/api/auth/login` also sets the readable `lidar_dashboard_csrf` cookie used only for `X-CSRF-Token`.
- `/api/auth/me` returns the operator profile with that cookie.
- Mutation APIs reject missing/expired cookies with `401`.
- Cookie-authenticated mutation APIs reject missing or mismatched `X-CSRF-Token` with `403`.
- Bearer JWT is kept only as backend compatibility for scripted clients.

## 5. Lidar PC Ingest Smoke

If `DEVICE_INGEST_API_KEY` is set, include the first configured key in every
ingest request:

```bash
-H "X-Device-Key: <device-ingest-key>"
```

`scripts/runtime-smoke.ps1` reads `DEVICE_INGEST_API_KEY` from the environment
or `.env` and sends this header automatically.

For focused field evidence, run the dedicated lidar ingest rehearsal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/lidar-ingest-rehearsal.ps1 -BaseUrl http://localhost:8080
```

The rehearsal sends representative `normal-driving`, duplicate
`normal-driving`, `wrong-way-level-1`, duplicate `wrong-way-level-1`,
`wrong-way-level-2`, and `situation-ended` payloads. It verifies unique vehicle
track creation, duplicate track update, wrong-way event reuse, linked control
commands, raw payload retention, summary KPI fields, and writes
`artifacts/field-lidar-rehearsal/<timestamp>/manifest.json` plus `manifest.md`.

`scripts/runtime-smoke.ps1` also verifies wrong-way event detail, preserved
`rawPayload`, linked `controlCommands`, command `packetHex`, and summary
`vehiclesPassed`.

The runtime smoke also verifies `GET /api/statistics/traffic?range=daily`
response shape, normal/wrong-way counters, `averageResponseMs`, and
`GET /api/control-board/status` latency fields including `responseSampleCount`
and latest-command `responseDurationMs`.

The same runtime smoke checks baseline delivery security behavior:

- Nginx/security headers include `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.
- Nginx/security headers include `Content-Security-Policy` with `default-src 'self'` and `object-src 'none'`.
- Nginx/cache headers keep the SPA entry route `no-store` and hashed `/assets/` files immutable.
- Mutation APIs without an operator token return `401`.
- Cookie-authenticated mutation APIs without `X-CSRF-Token` return `403`.
- Non-JSON mutation requests return `415`.
- When `DEVICE_INGEST_API_KEY` is configured, ingest without `X-Device-Key` returns `401`.

Normal-driving unique track smoke:

```bash
curl -X POST http://localhost:8080/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"normal-driving\",\"zone_id\":\"ROUNDABOUT-01\",\"track_id\":\"track-normal-001\",\"timestamp\":\"2026-07-02T10:00:00+09:00\",\"normal_moving_vehicle_count\":1}"
```

Normal-driving duplicate track smoke:

```bash
curl -X POST http://localhost:8080/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"normal-driving\",\"zone_id\":\"ROUNDABOUT-01\",\"track_id\":\"track-normal-001\",\"timestamp\":\"2026-07-02T10:00:01+09:00\",\"normal_moving_vehicle_count\":2}"
```

Wrong-way stage 1 smoke:

```bash
curl -X POST http://localhost:8080/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"wrong-way-level-1\",\"zone_id\":\"ROUNDABOUT-01\",\"track_id\":\"track-wrong-001\",\"timestamp\":\"2026-07-02T10:00:05+09:00\",\"warning_level\":1,\"confidence\":0.95,\"description\":\"Wrong-way driving detected\"}"
```

Wrong-way stage 2 smoke:

```bash
curl -X POST http://localhost:8080/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"wrong-way-level-2\",\"zone_id\":\"ROUNDABOUT-01\",\"track_id\":\"track-wrong-001\",\"timestamp\":\"2026-07-02T10:00:07+09:00\",\"warning_level\":2,\"confidence\":0.97,\"description\":\"Wrong-way escalation confirmed\"}"
```

Control-board TCP frame parser smoke:

```bash
curl -X POST http://localhost:8080/api/ingest/control-board/tcp/test \
  -H "Content-Type: application/json" \
  -d "{\"host\":\"192.168.0.50\",\"port\":5001,\"samplePacket\":\"02 A1 20 01 01 02 00 CD 03 0D\"}"
```

Use `/api/ingest/control-board` only when a bridge or test program forwards control-board response/status packets as HTTP JSON. It is a diagnostic ingest path, not the primary operator command path. The legacy `/api/ingest/control-board/serial/test` alias is kept only for older RS-485-era rehearsal scripts; new field rehearsals should use `/api/ingest/control-board/tcp/test`.

Situation-ended smoke:

```bash
curl -X POST http://localhost:8080/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"situation-ended\",\"zone_id\":\"ROUNDABOUT-01\",\"track_id\":\"track-wrong-001\",\"timestamp\":\"2026-07-02T10:00:20+09:00\",\"warning_level\":0,\"description\":\"Wrong-way situation ended\"}"
```

Expected:

- The first `normal-driving` request creates one `vehicle_tracks` row; the duplicate request updates the same row and does not create a duplicate `traffic_events` row.
- Repeated wrong-way payloads with the same `track_id` and stage update the existing unresolved `traffic_events` row and reuse its linked control command.
- `situation-ended` resolves active wrong-way events for the same `track_id` and records `SITUATION_ENDED_RESOLVED` event logs.
- `traffic_events` stores wrong-way and situation-ended events.
- `vehicle_tracks` stores one row per stable `track_id`.
- `/api/events/summary` reports `vehiclesPassed` from the DB unique `vehicle_tracks` count, not from the lidar raw counter.
- `control_commands` stores a dry-run `STAGE_1_ON` command while dry-run is enabled.
- Stage 2 stores a dry-run `STAGE_2_ON` command while dry-run is enabled.
- Situation-ended stores a dry-run `STAGE_2_RETURN` command while dry-run is enabled.

## 6. Control Board TCP Rehearsal

Before real TCP:

```bash
npm run verify:control-board-protocol
```

Focused command lifecycle rehearsal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl http://localhost:8080
```

The script logs in with the seeded operator credentials, sends `STAGE_1_ON`,
`STAGE_2_ON`, and `STAGE_2_RETURN` through `/api/control-board/commands/test`,
checks `packetHex`, `DRY_RUN` status, `averageResponseMs`, and
`responseSampleCount`, and writes
`artifacts/field-control-board-rehearsal/<timestamp>/manifest.json` plus
`manifest.md`.

When moving to live TCP:

1. Set `CONTROL_BOARD_HOST` and `CONTROL_BOARD_PORT`.
2. Confirm the network path with the hardware owner.
3. Set `CONTROL_BOARD_DRY_RUN=false`.
4. Re-run `scripts/control-board-field-rehearsal.ps1` with `-AllowLiveTcp`, or send `STAGE_1_ON` from the operator UI manual command panel.
5. Confirm packet/response in `control_commands` and `control_command_logs`.
6. Restore `CONTROL_BOARD_DRY_RUN=true` after the test unless continuing field validation.

## 7. Security Checks

Run:

```bash
npm run verify:statistics-metrics
npm run delivery:verify
npm --prefix dashboard/server test
npm audit --workspaces
```

On Windows PowerShell:

```powershell
npm.cmd run verify:statistics-metrics
npm.cmd run delivery:verify
npm.cmd --prefix dashboard/server test
npm.cmd audit --workspaces
```

`npm audit --workspaces` is kept as raw evidence and may exit non-zero while the
known Prisma development-tooling advisory remains unresolved. The pass/fail gate
is `npm run verify:audit-policy`, which is included in `npm run delivery:verify`.

Optional tools, if installed:

```bash
gitleaks detect --source . --redact
trivy fs --scanners vuln,secret,misconfig .
zap-baseline.py -t http://localhost:8080 -r zap-baseline.html
```

Windows evidence collection:

```powershell
npm.cmd run security:evidence
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/security-scan.ps1
```

For container image and ZAP evidence after the delivery stack is running:

```powershell
npm.cmd run security:evidence -- --include-container-images --include-zap --target-url=http://localhost:8080
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/security-scan.ps1 -IncludeContainerImages -IncludeZap -RequireScanners
```

Use `--require-scanners` with `npm.cmd run security:evidence` when skipped
gitleaks, Trivy, or OWASP ZAP checks should fail strict field acceptance.

Do not run active DAST/fuzzing against the real control board.

## 8. Stop And Collect Evidence

```bash
docker compose logs --no-color > delivery-compose.log
docker compose ps
docker compose down
```

Evidence package:

- `docs/ops/delivery-evidence-matrix.md` requirement-to-evidence coverage reference
- `.env` values redacted summary
- `artifacts/delivery/<timestamp>/manifest.md` and `manifest.json` from `npm run delivery:evidence`
- `artifacts/completion-audit/<timestamp>/manifest.json` and `artifacts/completion-audit/<timestamp>/manifest.md` from `npm run completion:audit`; confirm `canMarkGoalComplete` before declaring the project complete.
- `artifacts/delivery/<timestamp>/runtime/**` companion runtime evidence generated by `npm run delivery:evidence`
- `artifacts/delivery/<timestamp>/security/**` companion security evidence generated by `npm run delivery:evidence`
- `artifacts/runtime/<timestamp>/manifest.md` and `manifest.json` from `npm run runtime:evidence`; this records `.env.example` key coverage, present `.env` keys, missing `.env` keys, and the smoke base URL without storing secret values.
- `docker compose config --quiet` result
- `npm.cmd run smoke` or `npm run smoke` result
- `npm.cmd run ci` or `npm run ci` result
- frontend lint result
- `npm.cmd run verify:audit-policy` or `npm run verify:audit-policy` result
- `artifacts/field-acceptance/<timestamp>/manifest.json` and `manifest.md` from `scripts/field-acceptance.ps1`
- `artifacts/field-preflight/<timestamp>/manifest.json` and `manifest.md` from `scripts/field-preflight.ps1`
- `npm.cmd run security:evidence` manifest under `artifacts/security/<timestamp>/`
- `scripts/runtime-smoke.ps1` result when Docker runtime smoke is available
- `artifacts/field-db-rehearsal/<timestamp>/manifest.json` and `manifest.md` from `scripts/db-field-rehearsal.ps1`
- `artifacts/field-lidar-rehearsal/<timestamp>/manifest.json` and `manifest.md` from `scripts/lidar-ingest-rehearsal.ps1`
- `artifacts/field-control-board-rehearsal/<timestamp>/manifest.json` and `manifest.md` from `scripts/control-board-field-rehearsal.ps1`
- `FIELD_REHEARSAL_UNAVAILABLE` REVIEW manifests from `npm run field:rehearsal-unavailable` when the Docker/runtime/hardware environment is unavailable
- raw `npm audit --workspaces` result
- `artifacts/security/**` security scan evidence, with skipped checks explained
- Swagger screenshots or exported API list
- System/device status API responses
- Lidar ingest curl request/response
- Control command DB rows or API response
- Known limitations and skipped checks
