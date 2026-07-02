# Acceptance Checklist

Use this checklist during delivery rehearsal and field acceptance.

## Environment

- [ ] `.env` exists locally and is not committed.
- [ ] `JWT_SECRET` is unique and not the example value.
- [ ] `CONTROL_BOARD_DRY_RUN=true` before real hardware approval.
- [ ] `CORS_ORIGINS` only includes trusted operator UI origins.
- [ ] Nginx entrypoint is reachable at `http://<host>:<NGINX_PORT>`.

## Startup

- [ ] `docker compose config --quiet` passes.
- [ ] `docker compose up --build` starts DB, backend, frontend, and reverse proxy.
- [ ] `curl http://localhost:8080/healthz` returns `ok`.
- [ ] `curl http://localhost:8080/api/health` returns `ok: true`.
- [ ] `curl http://localhost:8080/api/database/health` returns table counts.
- [ ] `curl http://localhost:8080/api/status` returns server, database, ingest, websocket, devices, and control board sections.
- [ ] `curl http://localhost:8080/api/devices/status` returns configured device counts.

## Authentication

- [ ] Operator can log in through the UI.
- [ ] `/api/auth/login` returns a Bearer token.
- [ ] `/api/auth/me` returns the current operator with the token.
- [ ] Mutation API without token returns `401`.
- [ ] Manual control command records `requestedByUserId`.

## Lidar Ingest

- [ ] `normal-driving` with stable `track_id` creates one unique vehicle track.
- [ ] Repeated `normal-driving` updates `lastSeenAt` without creating traffic events.
- [ ] `wrong-way-level-1` creates a traffic event and stage 1 control command.
- [ ] `wrong-way-level-2` creates or updates a traffic event and stage 2 control command.
- [ ] `situation-ended` creates an end event and barrier return command.
- [ ] Raw payload is retained for diagnostics.

## Control Board

- [ ] `npm run verify:control-board-protocol` passes.
- [ ] Stage 1 packet equals `02 A1 10 01 01 02 00 9B 03 0D`.
- [ ] Stage 2 packet equals `02 A1 10 02 01 02 00 A1 03 0D`.
- [ ] Return packet equals `02 A1 10 02 02 02 00 1C 03 0D`.
- [ ] Reset packet equals `02 A1 10 00 00 02 00 E6 03 0D`.
- [ ] Dry-run command does not open a TCP socket.
- [ ] Live TCP command records response hex and CRC status.
- [ ] Timeout/failure records `FAILED` status and error message.
- [ ] Control board ingest creates a `device_status_logs` row and updates the Devices page.

## Operator UI

- [ ] Dashboard shows server, detector, and control board status.
- [ ] Dashboard clearly distinguishes `DRY_RUN` from `LIVE_TCP`.
- [ ] Latest command panel shows packet hex and command status.
- [ ] Wrong-way event page loads events from API.
- [ ] Event status and memo updates require login.
- [ ] Recent event list updates without layout breakage on desktop viewport.
- [ ] Devices page loads `/api/devices` data and marks empty/unconfigured state clearly.
- [ ] Event Log and Devices page show WebSocket connected/degraded state while polling fallback remains active.

## Swagger/API

- [ ] Swagger opens through Nginx at `/api-docs`.
- [ ] Auth schemas and Bearer scheme are visible.
- [ ] Wrong-way request/response schema matches implementation.
- [ ] Control board command endpoints are documented.
- [ ] Event list/detail/status/memo endpoints are documented.
- [ ] Site, zone, device, device status, and system status endpoints are documented.

## Security

- [ ] `npm run smoke` passes.
- [ ] `npm run ci` passes.
- [ ] `npm --prefix dashboard/dashboard-web run lint` passes.
- [ ] `npm audit --workspaces` result is documented.
- [ ] Secret scan result is documented or marked 미검증 with reason.
- [ ] Container scan result is documented or marked 미검증 with reason.
- [ ] ZAP passive baseline result is documented or marked 미검증 with reason.
- [ ] Active scans against real control board were not run.

## Known Limitations

- [ ] `wrong-way-level-2` dashboard-side escalation criteria are still field-measurement dependent.
- [ ] Lidar/device network authentication beyond trusted LAN/IP policy is a follow-up security item.
- [ ] Real integrated control board TCP test requires field IP/port and hardware approval.
- [ ] Docker Desktop/PostgreSQL availability is recorded for the test machine.
