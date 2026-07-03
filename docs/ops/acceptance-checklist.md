# Acceptance Checklist

Use this checklist during delivery rehearsal and field acceptance.

## Environment

- [ ] `.env` exists locally and is not committed.
- [ ] `JWT_SECRET` is unique and not the example value.
- [ ] `DEVICE_INGEST_API_KEY` is set when the lidar PC or bridge can send `X-Device-Key`, or the trusted-LAN exception is documented.
- [ ] Accepted trusted-LAN, scanner, Swagger, HTTPS cookie, dry-run, or unavailable-hardware exceptions use `docs/ops/field-risk-acceptance-template.md` and are attached as `artifacts/manual/field-risk-acceptance.md`.
- [ ] `CONTROL_BOARD_DRY_RUN=true` before real hardware approval.
- [ ] `CONTROL_BOARD_LIVE_APPROVED=false` until the hardware owner explicitly approves live TCP command testing.
- [ ] `CORS_ORIGINS` only includes trusted operator UI origins.
- [ ] `AUTH_COOKIE_SECURE=true` is set when HTTPS/TLS is used through the delivery proxy.
- [ ] `AUTH_COOKIE_SAMESITE` matches the deployment topology (`lax` for same-site Nginx entrypoint, `none` only when cross-site HTTPS is required); `SameSite=None` forces Secure cookies.
- [ ] `NGINX_WRONGWAY_RATE_LIMIT` and `NGINX_WRONGWAY_BURST` match the expected lidar event rate.
- [ ] `NGINX_CONTENT_SECURITY_POLICY` is reviewed for the final camera/lidar/media host topology.
- [ ] `NGINX_SWAGGER_ALLOW` is restricted to the operator/internal network if Swagger should not be open to all internal clients.
- [ ] Nginx entrypoint is reachable at `http://<host>:<NGINX_PORT>`.

## Startup

- [ ] `docs/ops/delivery-evidence-matrix.md` is reviewed as the requirement-to-evidence coverage map.
- [ ] `docker compose config --quiet` passes.
- [ ] `npm run field:preflight` or `scripts/field-preflight.ps1` records field preflight evidence for `.env`, `JWT_SECRET`, `DEVICE_INGEST_API_KEY`, control-board dry-run/live TCP readiness and live approval, cookie security, `CORS_ORIGINS`, `NGINX_SWAGGER_ALLOW`, `NGINX_WRONGWAY_RATE_LIMIT`, `NGINX_WRONGWAY_BURST`, and `NGINX_CONTENT_SECURITY_POLICY`.
- [ ] `npm run runtime:evidence` records Docker CLI, daemon availability, compose config, and `.env` key inventory.
- [ ] `npm run delivery:evidence` creates `artifacts/delivery/<timestamp>/manifest.md`, `manifest.json`, and companion `runtime/` and `security/` evidence folders.
- [ ] Delivery evidence records `Git upstream`, `Git upstream commit`, `Git pushed to origin/dev`, and `Working tree clean` so source revision freshness can be compared with the final handover package.
- [ ] `npm run completion:audit` creates `artifacts/completion-audit/<timestamp>/manifest.json` plus `artifacts/completion-audit/<timestamp>/manifest.md`, references latest delivery evidence, manual evidence readiness, field readiness, field risk register, field action board, field gate closure map, and field owner briefs manifests, records redacted required field value states from field readiness, checks required manual evidence for `artifacts/manual/operator-ui-walkthrough.md` and `artifacts/manual/field-risk-acceptance.md`, lists `Field Rehearsal Follow-ups` when unavailable rehearsal evidence is used, and keeps `canMarkGoalComplete=false` while field readiness, field verification, required manual evidence, field action artifact open counts, or skipped/review evidence remains.
- [ ] `npm run handover:index` creates `artifacts/handover-index/<timestamp>/manifest.json` plus `manifest.md` listing the latest required handover manifests, missing/review/stale areas, `Field Action Artifacts`, and `Field Rehearsal Follow-ups` with source evidence and closure plan links.
- [ ] `npm run field:closure-plan` creates `artifacts/field-closure-plan/<timestamp>/manifest.json` plus `manifest.md` listing the field commands, completion blockers, redacted required field value states, open required field values, `Field Action Artifact Actions`, `Field Rehearsal Follow-up Actions`, manual evidence actions, and done-when criteria needed to close open REVIEW/STALE/MISSING areas; status remains `OPEN` until these counts are all zero.
- [ ] `FIELD_REVIEWER` and `FIELD_SITE_NAME` are set to concrete delivery-session values before running generated field commands; `npm run manual:evidence-drafts -- --base-url=http://localhost:8080 --site-name="$env:FIELD_SITE_NAME" --reviewer="$env:FIELD_REVIEWER"` creates missing reviewer-fillable drafts under `artifacts/manual/` and writes `artifacts/manual-evidence-drafts/<timestamp>/manifest.json` plus `manifest.md`; existing manual evidence files are preserved unless `--force` is intentionally used.
- [ ] `npm run manual:evidence-readiness` creates `artifacts/manual-evidence-readiness/<timestamp>/manifest.json` plus `manifest.md`, showing required manual evidence target paths, template paths, validation failures, and next actions; this checklist does not replace reviewer-filled manual evidence.
- [ ] `npm run field:readiness` creates `artifacts/field-readiness/<timestamp>/manifest.json` plus `manifest.md` checking Docker, Nginx/API health, env readiness, control-board TCP mode, timing values, `DRY_RUN_SAFE`/`LIVE_TCP_READY`/`LIVE_TCP_REVIEW`, Swagger exposure, optional scanner availability, and `Field Value Action Groups` for Auth/Security, LiDAR ingest, control-board TCP, and Nginx delivery owners.
- [ ] `npm run field:risk-register` creates `artifacts/field-risk-register/<timestamp>/manifest.json` plus `manifest.md`, grouping open field/security/manual risks and producing reviewer-copyable `Risk Acceptance Draft Rows` without replacing `artifacts/manual/field-risk-acceptance.md`.
- [ ] `npm run field:action-board` creates `artifacts/field-action-board/<timestamp>/manifest.json` plus `manifest.md`, grouping remaining final-status gates by owner, priority, execution phase, mapped command, evidence path, and close criteria without replacing field evidence.
- [ ] `npm run field:gate-closure-map` creates `artifacts/field-gate-closure-map/<timestamp>/manifest.json` plus `manifest.md`, grouping the latest action board by command so reviewers can see which gates, categories, statuses, and close criteria each field command is expected to close.
- [ ] `npm run field:owner-briefs` creates `artifacts/field-owner-briefs/<timestamp>/manifest.json` plus per-owner markdown brief files generated from the latest field action board, including owner phase counts.
- [ ] `npm run handover:package -- --base-url=http://localhost:8080` refreshes delivery evidence, manual evidence drafts, manual evidence readiness, field readiness, field risk register, field action board, field gate closure map, field owner briefs, completion audit, field closure plan, and handover index in order against the delivery Nginx entrypoint, then writes `artifacts/handover-package/<timestamp>/manifest.json` plus `manifest.md` with the base URL, strict gate reasons, latest manual evidence draft/readiness/risk-register/action-board/gate-closure-map/owner-brief references, latest control-board safety status, and `Field Evidence Follow-ups`; strict completion uses `npm run handover:package -- --base-url=http://localhost:8080 --strict`.
- [ ] Handover package records `Git commit`, `Git branch`, `Git upstream`, `Git upstream commit`, `Git pushed to origin/dev`, and `Working tree clean`; confirm these match the dev revision being delivered.
- [ ] `npm run verify:final-status` passes after the final handover package refresh, proving READY/COMPLETE claims require `canMarkGoalComplete=true`, `LIVE_TCP_READY`, PRESENT manual evidence, manual evidence readiness, a security evidence manifest, non-blocking strict security evidence, empty `Residual Field Gates`, and fresh referenced artifacts including security evidence.
- [ ] Before the final status report is shared, the working tree is clean, the current branch is `dev`, upstream is `origin/dev`, and the final delivery commit has been pushed to `origin/dev`.
- [ ] Git-bearing evidence has been regenerated from the same final delivery commit.
- [ ] `npm run final:status -- --base-url=http://localhost:8080` creates `artifacts/final-status/<timestamp>/manifest.json` plus `manifest.md`; final close is allowed only when this report says `READY_TO_CLOSE` and `canMarkGoalComplete=true`, otherwise close the listed `remainingGates` using the `Gate Action Summary` action types.
- [ ] Final status `Field Acceptance` summary shows latest field acceptance status `PASS`, `readyForHandover=true`, `requiresFieldReview=false`, zero review/skipped steps, and operator UI walkthrough step `PASS`.
- [ ] Final status has no `Field Acceptance` `PLACEHOLDER_METADATA` gate; reviewer and site name are concrete delivery-session values, not `field-reviewer-name`, `delivery-site-name`, `unknown`, or `pending`.
- [ ] Final status `Delivery Entrypoint Consistency` shows field readiness, security evidence, runtime evidence, and handover package were generated for the same delivery Nginx base URL passed to `final:status`.
- [ ] Final status `Git Delivery State` has no `WRONG_BRANCH`, `WRONG_UPSTREAM`, or `UNPUSHED` gate.
- [ ] Final status `Source Revision Freshness` shows no dirty source state, no non-`dev` evidence branch, and no stale Git commit for handover, manual readiness, action-board, gate-closure, owner-brief, or delivery evidence that records Git metadata.
- [ ] `npm run final:execution-plan -- --base-url=http://localhost:8080` creates `artifacts/final-execution-plan/<timestamp>/manifest.json` plus `manifest.md`, translating the latest final-status `remainingGates` into an ordered execution plan for manual evidence, field runtime, rehearsals, security evidence, source revision closeout (`git status --short --branch`; `git push origin dev`), `completion:audit`, `handover:index`, `field:closure-plan`, strict handover packaging, and final status refresh; confirm `Command Gate Coverage` maps each command back to its gate count/category/status/evidence, confirm the package refresh section exposes `Field Action Artifact Actions` before the strict package rebuild, and remember this plan does not replace actual field evidence.
- [ ] `npm run field:acceptance` or `scripts/field-acceptance.ps1` runs the field acceptance orchestrator and creates `artifacts/field-acceptance/<timestamp>/manifest.json` plus `manifest.md`.
- [ ] Field acceptance reads the latest preflight manifest and adds a review/skipped gate when preflight status is not `PASS`.
- [ ] Field acceptance manifest records the field reviewer, site name, handover readiness, skipped/review step counts, and next actions.
- [ ] Field acceptance manifest records child evidence references for preflight, runtime, DB, LiDAR, control-board, security, and delivery manifests.
- [ ] Field acceptance records the operator UI browser walkthrough gate; pass `-OperatorUiWalkthroughEvidence <path>` after capturing the delivery display resolution walkthrough, or keep the step in REVIEW/SKIPPED with reviewer acceptance.
- [ ] Operator UI walkthrough uses `docs/ops/operator-ui-walkthrough-template.md` and the filled evidence is attached as `artifacts/manual/operator-ui-walkthrough.md`.
- [ ] Field acceptance `readyForHandover=true` is allowed only when the status is `PASS`, latest preflight status is `PASS`, and reviewer/site name are concrete values, not placeholders such as `field-reviewer`, `field-site`, `unknown`, or `pending`.
- [ ] `docker compose up --build` starts DB, backend, frontend, and reverse proxy.
- [ ] `curl http://localhost:8080/healthz` returns `ok`.
- [ ] `curl http://localhost:8080/api/health` returns `ok: true`.
- [ ] Authenticated operator curl with the login cookie checks `/api/database/health` and returns table counts.
- [ ] Authenticated operator curl with the login cookie checks `/api/status` and returns server, database, ingest, websocket, devices, and control board sections.
- [ ] Authenticated operator curl with the login cookie checks `/api/devices/status` and returns configured device counts.
- [ ] `scripts/db-field-rehearsal.ps1` records DB/Prisma field evidence; `-RunDeploy` and `-RunSeed` are used only after the field PostgreSQL target is confirmed.
- [ ] If the delivery runtime or field hardware is unavailable, `npm run field:rehearsal-unavailable` records `FIELD_REHEARSAL_UNAVAILABLE` REVIEW manifests instead of leaving field rehearsal evidence missing, and concrete `--replacement-owner` plus `--target-recheck-date=YYYY-MM-DD` values are reflected in delivery evidence, completion audit, handover index, field closure plan, and handover package follow-up tables.
- [ ] Field rehearsal PASS manifests use concrete reviewer, site, host, replacement owner, and recheck metadata; placeholder values such as `field-reviewer`, `field-site`, `unknown`, `pending`, or `TBD` remain REVIEW in delivery evidence.
- [ ] Re-running Prisma seed refreshes the default 월출산휴게소 site, `ROUNDABOUT-01/02`, lidar PC, and control board names without mojibake.
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
- [ ] `/api/events/summary` reports `vehiclesPassed` from DB unique `vehicle_tracks`, plus `wrongwayVehicles`, `wrongWayEvents`, and `wrongwayRate` for operator KPI review.
- [ ] `scripts/runtime-smoke.ps1` passes with `DEVICE_INGEST_API_KEY` enabled when field ingest keys are configured.
- [ ] `scripts/lidar-ingest-rehearsal.ps1` creates field evidence for unique vehicle track creation, duplicate updates, `wrong-way-level-1` -> `STAGE_1_ON`, `wrong-way-level-2` -> `STAGE_2_ON`, and situation-ended -> `STAGE_2_RETURN` resolution.

## Control Board

- [ ] `npm run verify:control-board-protocol` passes.
- [ ] Stage 1 packet equals `02 A1 10 01 01 02 00 9B 03 0D`.
- [ ] Stage 2 packet equals `02 A1 10 02 01 02 00 A1 03 0D`.
- [ ] Return packet equals `02 A1 10 02 02 02 00 1C 03 0D`.
- [ ] Reset packet equals `02 A1 10 00 00 02 00 E6 03 0D`.
- [ ] Dry-run command does not open a TCP socket.
- [ ] `scripts/control-board-field-rehearsal.ps1` records `DRY_RUN` command lifecycle evidence before live hardware approval.
- [ ] `scripts/control-board-field-rehearsal.ps1 -AllowLiveTcp` is used only after live `CONTROL_BOARD_HOST`/`PORT` and hardware approval are confirmed.
- [ ] Control-board rehearsal confirms `safetyStatus`, `liveTcpReady`, `liveApproved`, 10-byte `packetHex`, and `DRY_RUN_SKIPPED_SEND` evidence while dry-run is enabled.
- [ ] If `CONTROL_BOARD_DRY_RUN=false` but `CONTROL_BOARD_LIVE_APPROVED=true` is not recorded, manual or automatic commands are blocked with `LIVE_TCP_APPROVAL_REQUIRED` evidence instead of sending TCP.
- [ ] Live TCP command records response hex and CRC status.
- [ ] Connect timeout and response timeout are distinguishable in error messages.
- [ ] Timeout/failure records `FAILED` status, final error message, and per-attempt retry logs.
- [ ] `/api/ingest/control-board/tcp/test` validates the 10-byte TCP frame sample and CRC parser.
- [ ] `/api/ingest/control-board` is treated only as an HTTP bridge/diagnostic ingest path for response/status packets, not as the primary operator command path.
- [ ] `/api/ingest/control-board/serial/test` is documented as a legacy compatibility alias; new field rehearsals use `/api/ingest/control-board/tcp/test`.
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
- [ ] WebSocket disabled or missing URL state is shown as disabled/degraded, never as connected.
- [ ] Operator UI browser walkthrough evidence captures login, dashboard status, DRY_RUN/LIVE_TCP state, event detail raw payload and command timeline, Devices, Event Log realtime/degraded state, statistics, Swagger entrypoint, and the delivery display resolution.

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
- [ ] `npm run verify:statistics-metrics` passes and confirms unique track counts, wrong-way rate, command success rate, and average TCP ACK response vectors.
- [ ] `npm --prefix dashboard/server test` passes for backend protocol and contract checks.
- [ ] `npm run ci` passes.
- [ ] `npm --prefix dashboard/dashboard-web run lint` passes.
- [ ] `npm run verify:audit-policy` passes.
- [ ] `npm run security:evidence` creates `artifacts/security/<timestamp>/manifest.md` and `manifest.json`.
- [ ] Raw `npm audit --workspaces` result is documented.
- [ ] Runtime smoke confirms security headers through the Nginx entrypoint.
- [ ] Runtime smoke confirms `Content-Security-Policy` through the Nginx entrypoint.
- [ ] Runtime smoke confirms CSRF rejection for cookie-authenticated mutation requests without `X-CSRF-Token`.
- [ ] Runtime smoke confirms `GET /api/statistics/traffic?range=daily` counters and `averageResponseMs`.
- [ ] Runtime smoke confirms `GET /api/control-board/status` exposes `averageResponseMs`, `responseSampleCount`, `liveApproved`, and latest-command `responseDurationMs`.
- [ ] If `DEVICE_INGEST_API_KEY` is configured, `/api/wrongway`, `/api/ingest/lidar`, and `/api/ingest/control-board` without `X-Device-Key` return `401`.
- [ ] `scripts/security-scan.ps1` evidence exists under `artifacts/security/`, or skipped tools are documented with reasons.
- [ ] Strict security acceptance uses `--require-scanners` or `-RequireScanners` so skipped gitleaks, Trivy, and OWASP ZAP checks fail the evidence run.
- [ ] `artifacts/security/<timestamp>/manifest.md` includes the `Scanner Closeout Matrix`, and every scanner row is either `EVIDENCE_READY`, documented `RISK_ACCEPTED`, or assigned for recheck in `artifacts/manual/field-risk-acceptance.md`.
- [ ] Security evidence manifest records acceptance classifications for `통과`, `차단`, `납품 전 수정`, `위험 수용`, and `미검증` items.
- [ ] Delivery evidence manifest exists under `artifacts/delivery/` and links raw command logs.
- [ ] Secret scan result is documented or marked unverified with reason.
- [ ] Container scan result is documented or marked unverified with reason.
- [ ] ZAP passive baseline result is documented or marked unverified with reason.
- [ ] Active scans against real control board were not run.

## Known Limitations

- [ ] `wrong-way-level-2` dashboard-side escalation criteria are still field-measurement dependent.
- [ ] If `DEVICE_INGEST_API_KEY` is not used, lidar/device network authentication remains a documented follow-up or accepted trusted-LAN risk.
- [ ] If any field risk is accepted instead of resolved, the reviewer decision, compensating control, expiry/recheck date, and owner are recorded.
- [ ] Real integrated control board TCP test requires field IP/port, `CONTROL_BOARD_LIVE_APPROVED=true`, and hardware approval.
- [ ] Docker Desktop/PostgreSQL availability is recorded for the test machine.
