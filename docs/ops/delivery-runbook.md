# Delivery Runbook

This runbook describes the field rehearsal flow for the lidar wrong-way prevention dashboard.

## 1. Preflight

- Confirm the dashboard PC, lidar PC, and integrated control board are on the expected internal network.
- Copy `.env.example` to `.env` and fill only local/field values in `.env`.
- Set a long random `JWT_SECRET`.
- Keep `CONTROL_BOARD_DRY_RUN=true` until the TCP host/port is confirmed with the hardware owner.
- Confirm `CONTROL_BOARD_HOST`, `CONTROL_BOARD_PORT`, timeout, retry, and heartbeat values with the field network plan.

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

Default URLs:

- Operator UI: `http://localhost:8080`
- Backend API through proxy: `http://localhost:8080/api/health`
- Swagger: `http://localhost:8080/api-docs`
- Backend direct health: `http://localhost:5000/api/health`

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
curl http://localhost:8080/api/database/health
curl http://localhost:8080/api/status
curl http://localhost:8080/api/devices/status
```

Field topology verification:

```bash
curl http://localhost:8080/api/sites
curl http://localhost:8080/api/zones
curl http://localhost:8080/api/devices
```

Expected:

- `sites`, `zones`, and `devices` reflect Prisma seed or field registration data.
- Empty device lists are treated as `장비 미구성`, not as live hardware status.
- `/api/status` summarizes server, database, ingest, WebSocket, devices, and control board mode.

## 4. Operator Account

Seeded account values come from `.env`:

```env
SEED_ADMIN_USER_ID=admin
SEED_ADMIN_PASSWORD=replace_in_field
SEED_ADMIN_NAME=System Administrator
```

After first login, confirm:

- `/api/auth/login` returns a Bearer token.
- `/api/auth/me` returns the operator profile with the Bearer token.
- Mutation APIs reject missing/expired tokens with `401`.

## 5. Lidar PC Ingest Smoke

Normal-driving unique track smoke:

```bash
curl -X POST http://localhost:8080/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"normal-driving\",\"zone_id\":\"ROUNDABOUT-01\",\"track_id\":\"track-normal-001\",\"timestamp\":\"2026-07-02T10:00:00+09:00\",\"normal_moving_vehicle_count\":1}"
```

Wrong-way stage 1 smoke:

```bash
curl -X POST http://localhost:8080/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"wrong-way-level-1\",\"zone_id\":\"ROUNDABOUT-01\",\"track_id\":\"track-wrong-001\",\"timestamp\":\"2026-07-02T10:00:05+09:00\",\"warning_level\":1,\"confidence\":0.95,\"description\":\"Wrong-way driving detected\"}"
```

Expected:

- `traffic_events` stores wrong-way events.
- `vehicle_tracks` stores one row per stable `track_id`.
- `control_commands` stores a dry-run `STAGE_1_ON` command while dry-run is enabled.

## 6. Control Board TCP Rehearsal

Before real TCP:

```bash
npm run verify:control-board-protocol
```

When moving to live TCP:

1. Set `CONTROL_BOARD_HOST` and `CONTROL_BOARD_PORT`.
2. Confirm the network path with the hardware owner.
3. Set `CONTROL_BOARD_DRY_RUN=false`.
4. Send `STAGE_1_ON` from the operator UI manual command panel.
5. Confirm packet/response in `control_commands` and `control_command_logs`.
6. Restore `CONTROL_BOARD_DRY_RUN=true` after the test unless continuing field validation.

## 7. Security Checks

Run:

```bash
npm run smoke
npm run ci
npm audit --workspaces
docker compose config --quiet
```

Optional tools, if installed:

```bash
gitleaks detect --source . --redact
trivy fs --scanners vuln,secret,misconfig .
zap-baseline.py -t http://localhost:8080 -r zap-baseline.html
```

Do not run active DAST/fuzzing against the real control board.

## 8. Stop And Collect Evidence

```bash
docker compose logs --no-color > delivery-compose.log
docker compose ps
docker compose down
```

Evidence package:

- `.env` values redacted summary
- `docker compose config --quiet` result
- `npm run smoke` result
- `npm run ci` result
- `npm audit --workspaces` result
- Swagger screenshots or exported API list
- System/device status API responses
- Lidar ingest curl request/response
- Control command DB rows or API response
- Known limitations and skipped checks
