# Acceptance Checklist

Use this checklist during delivery rehearsal and field acceptance.

## Environment

- [ ] `.env` exists locally and is not committed.
- [ ] `JWT_SECRET` is unique and not the example value.
- [ ] `DEVICE_INGEST_API_KEY` is set when the lidar PC or bridge can send `X-Device-Key`, or the trusted-LAN exception is documented.
- [ ] `CONTROL_BOARD_DRY_RUN=true` before real hardware approval.
- [ ] `CORS_ORIGINS` only includes trusted operator UI origins.
- [ ] `AUTH_COOKIE_SECURE=true` is set when HTTPS/TLS is used through the delivery proxy.
- [ ] `AUTH_COOKIE_SAMESITE` matches the deployment topology (`lax` for same-site Nginx entrypoint, `none` only when cross-site HTTPS is required).
- [ ] `NGINX_WRONGWAY_RATE_LIMIT` and `NGINX_WRONGWAY_BURST` match the expected lidar event rate.
- [ ] `NGINX_CONTENT_SECURITY_POLICY` is reviewed for the final camera/lidar/media host topology.
- [ ] `NGINX_SWAGGER_ALLOW` is restricted to the operator/internal network if Swagger should not be open to all internal clients.
- [ ] Nginx entrypoint is reachable at `http://<host>:<NGINX_PORT>`.

## Startup

- [ ] `docs/ops/delivery-evidence-matrix.md` is reviewed as the requirement-to-evidence coverage map.
- [ ] `docker compose config --quiet` passes.
- [ ] `npm run runtime:evidence` records Docker CLI, daemon availability, compose config, and `.env` key inventory.
- [ ] `npm run delivery:evidence` creates `artifacts/delivery/<timestamp>/manifest.md` and `manifest.json`.
- [ ] `docker compose up --build` starts DB, backend, frontend, and reverse proxy.
- [ ] `curl http://localhost:8080/healthz` returns `ok`.
- [ ] `curl http://localhost:8080/api/health` returns `ok: true`.
- [ ] `curl http://localhost:8080/api/database/health` returns table counts.
- [ ] `curl http://localhost:8080/api/status` returns server, database, ingest, websocket, devices, and control board sections.
- [ ] `curl http://localhost:8080/api/devices/status` returns configured device counts.
- [ ] Browser WebSocket URL uses `ws://<host>:<NGINX_PORT>/ws` through Nginx.
- [ ] `/assets/` responses include immutable cache headers, while SPA entry routes include `Cache-Control: no-store`.

## Authentication

- [ ] Operator can log in through the UI.
- [ ] `/api/auth/login` sets the `lidar_dashboard_access` HttpOnly cookie and does not expose the JWT in the response body.
- [ ] `/api/auth/login` sets the readable `lidar_dashboard_csrf` cookie for mutation request CSRF protection.
- [ ] `/api/auth/me` returns the current operator with the HttpOnly cookie.
- [ ] Bearer JWT remains available only as backend compatibility for scripted clients.
- [ ] Mutation API without an auth cookie or compatible Bearer token returns `401`.
- [ ] Cookie-authenticated mutation API without `X-CSRF-Token` returns `403`.
- [ ] Non-JSON mutation request returns `415`.
- [ ] Manual control command records `requestedByUserId`.

## Lidar Ingest

- [ ] `normal-driving` with stable `track_id` creates one unique vehicle track.
- [ ] Repeated `normal-driving` updates `lastSeenAt` without creating traffic events.
- [ ] `wrong-way-level-1` creates a traffic event and stage 1 control command.
- [ ] `wrong-way-level-2` creates or updates a traffic event and stage 2 control command.
- [ ] `situation-ended` creates an end event and barrier return command.
- [ ] Raw payload is retained for diagnostics.
- [ ] `/api/events/summary` reports `vehiclesPassed` from DB unique `vehicle_tracks`, not from the lidar raw counter.
- [ ] `scripts/runtime-smoke.ps1` passes with `DEVICE_INGEST_API_KEY` enabled when field ingest keys are configured.

## Control Board

- [ ] `npm run verify:control-board-protocol` passes.
- [ ] Stage 1 packet equals `02 A1 10 01 01 02 00 9B 03 0D`.
- [ ] Stage 2 packet equals `02 A1 10 02 01 02 00 A1 03 0D`.
- [ ] Return packet equals `02 A1 10 02 02 02 00 1C 03 0D`.
- [ ] Reset packet equals `02 A1 10 00 00 02 00 E6 03 0D`.
- [ ] Dry-run command does not open a TCP socket.
- [ ] Live TCP command records response hex and CRC status.
- [ ] Timeout/failure records `FAILED` status and error message.
- [ ] `/api/ingest/control-board/tcp/test` validates the 10-byte TCP frame sample and CRC parser.
- [ ] Control board ingest creates a `device_status_logs` row and updates the Devices page.
- [ ] Event detail exposes linked `controlCommands`, `packetHex`, response hex, CRC status, and command logs.

## Operator UI

- [ ] Dashboard shows server, detector, and control board status.
- [ ] Dashboard clearly distinguishes `DRY_RUN` from `LIVE_TCP`.
- [ ] Latest command panel shows packet hex and command status.
- [ ] Event detail shows raw payload and the control command timeline for wrong-way events.
- [ ] Wrong-way event page loads events from API.
- [ ] Event status and memo updates require login.
- [ ] Recent event list updates without layout breakage on desktop viewport.
- [ ] Devices page loads `/api/devices` data and marks empty/unconfigured state clearly.
- [ ] Event Log and Devices page show WebSocket connected/degraded state while polling fallback remains active.
- [ ] Event Log receives realtime updates through `/ws` when Nginx is the browser entrypoint.

## Swagger/API

- [ ] Swagger opens through Nginx at `/api-docs`.
- [ ] Auth schemas show `cookieAuth` plus `csrfHeaderAuth` for cookie-authenticated mutations and Bearer as compatibility.
- [ ] Wrong-way request/response schema matches implementation.
- [ ] Wrong-way and external ingest endpoints document optional `X-Device-Key` security.
- [ ] Control board command endpoints are documented.
- [ ] Event list/detail/status/memo endpoints are documented.
- [ ] Event detail schema includes linked `controlCommands` and `eventLogs`.
- [ ] Site, zone, device, device status, and system status endpoints are documented.

## Security

- [ ] `npm run smoke` passes.
- [ ] `npm --prefix dashboard/server test` passes for backend protocol and contract checks.
- [ ] `npm run ci` passes.
- [ ] `npm --prefix dashboard/dashboard-web run lint` passes.
- [ ] `npm run verify:audit-policy` passes.
- [ ] `npm run security:evidence` creates `artifacts/security/<timestamp>/manifest.md` and `manifest.json`.
- [ ] Raw `npm audit --workspaces` result is documented.
- [ ] Runtime smoke confirms security headers through the Nginx entrypoint.
- [ ] Runtime smoke confirms `Content-Security-Policy` through the Nginx entrypoint.
- [ ] Runtime smoke confirms CSRF rejection for cookie-authenticated mutation requests without `X-CSRF-Token`.
- [ ] If `DEVICE_INGEST_API_KEY` is configured, ingest without `X-Device-Key` returns `401`.
- [ ] `scripts/security-scan.ps1` evidence exists under `artifacts/security/`, or skipped tools are documented with reasons.
- [ ] Delivery evidence manifest exists under `artifacts/delivery/` and links raw command logs.
- [ ] Secret scan result is documented or marked unverified with reason.
- [ ] Container scan result is documented or marked unverified with reason.
- [ ] ZAP passive baseline result is documented or marked unverified with reason.
- [ ] Active scans against real control board were not run.

## Known Limitations

- [ ] `wrong-way-level-2` dashboard-side escalation criteria are still field-measurement dependent.
- [ ] If `DEVICE_INGEST_API_KEY` is not used, lidar/device network authentication remains a documented follow-up or accepted trusted-LAN risk.
- [ ] Real integrated control board TCP test requires field IP/port and hardware approval.
- [ ] Docker Desktop/PostgreSQL availability is recorded for the test machine.
