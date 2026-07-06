# Delivery Runbook

This runbook describes the field rehearsal flow for the lidar wrong-way prevention dashboard.

## 1. Preflight

- Confirm the dashboard PC, lidar PC, and integrated control board are on the expected internal network.
- Copy `.env.example` to `.env` and fill only local/field values in `.env`.
- Set a long random `JWT_SECRET`.
- Keep operator authentication on HttpOnly cookie mode; keep the readable CSRF cookie name aligned with the frontend default and set `AUTH_COOKIE_SECURE=true` when HTTPS/TLS is used.
- Set `DEVICE_INGEST_API_KEY` if the lidar PC and control-board bridge can send the `X-Device-Key` header.
- If `DEVICE_INGEST_API_KEY`, scanner evidence, Swagger restriction, HTTPS cookie
  posture, or live hardware rehearsal cannot pass directly, fill
  `docs/ops/field-risk-acceptance-template.md` and attach the field copy as
  `artifacts/manual/field-risk-acceptance.md`.
- Keep `CONTROL_BOARD_DRY_RUN=true` until the TCP host/port is confirmed with the hardware owner.
- Keep `CONTROL_BOARD_LIVE_APPROVED=false` until the hardware owner explicitly approves live TCP command testing.
- Confirm `CONTROL_BOARD_HOST`, `CONTROL_BOARD_PORT`, timeout, retry, and heartbeat values with the field network plan.
- Confirm `NGINX_WRONGWAY_RATE_LIMIT`, `NGINX_WRONGWAY_BURST`, `NGINX_CONTENT_SECURITY_POLICY`, and `NGINX_SWAGGER_ALLOW` match the field network, media host topology, and Swagger exposure policy; do not leave `NGINX_SWAGGER_ALLOW=all` for delivery.

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
npm.cmd run field:rehearsal-unavailable -- --reason="Docker runtime or field hardware is unavailable on this workstation" --replacement-owner="field-owner" --target-recheck-date="2026-08-01" --approval-note="temporary local workstation evidence"
npm.cmd run delivery:evidence
npm.cmd run completion:audit
$env:FIELD_REVIEWER="<actual reviewer name>"
$env:FIELD_SITE_NAME="<actual delivery site name>"
npm.cmd run field:readiness -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run field:risk-register -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run manual:evidence-drafts -- --base-url=http://localhost:8080 --site-name="$env:FIELD_SITE_NAME" --reviewer="$env:FIELD_REVIEWER"
npm.cmd run manual:evidence-readiness -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run field:action-board -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run field:gate-closure-map -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run field:owner-briefs -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run ci:status -- --generated-by="$env:FIELD_REVIEWER"
# If no CI run exists for the final dev commit, trigger and wait intentionally during the approved external CI closeout window:
# npm.cmd run ci:closeout -- --dispatch --generated-by="$env:FIELD_REVIEWER"
npm.cmd run handover:index -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run field:closure-plan -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run handover:package -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run final:status -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
npm.cmd run final:execution-plan -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"
```

Use `npm.cmd` and `curl.exe` on Windows when the local PowerShell execution
policy blocks `npm.ps1` or aliases `curl`.
The read-only `ci:status` report includes a `CI Closeout Checklist` for source
branch, pushed HEAD, workflow state, manual dispatch configuration, push
trigger, Actions permissions, matching HEAD run, and successful completion.

Before sharing the final status report, confirm the delivery source is on
`dev`, tracks `origin/dev`, has a clean working tree, and the final commit has
already been pushed to `origin/dev`. `npm.cmd run final:status` records these
values and opens a `Git Delivery State` gate when the branch, upstream, or
push state does not match the direct-push delivery policy.

For a single ordered field acceptance pass, use the orchestrator:

```powershell
$env:FIELD_REVIEWER="<actual reviewer name>"
$env:FIELD_SITE_NAME="<actual delivery site name>"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/field-preflight.ps1 -BaseUrl http://localhost:8080 -Reviewer "$env:FIELD_REVIEWER" -SiteName "$env:FIELD_SITE_NAME"
npm.cmd run field:preflight -- -BaseUrl http://localhost:8080 -Reviewer "$env:FIELD_REVIEWER" -SiteName "$env:FIELD_SITE_NAME"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/field-acceptance.ps1 -BaseUrl http://localhost:8080
npm.cmd run field:acceptance -- -BaseUrl http://localhost:8080 -Reviewer "$env:FIELD_REVIEWER" -SiteName "$env:FIELD_SITE_NAME"
```

The preflight records `.env` readiness, `JWT_SECRET`, seed admin password,
`DEVICE_INGEST_API_KEY`, `CONTROL_BOARD_DRY_RUN`, `CONTROL_BOARD_LIVE_APPROVED`, live TCP host/port,
`AUTH_COOKIE_SECURE`, `AUTH_COOKIE_SAMESITE`, `CORS_ORIGINS`,
`NGINX_SWAGGER_ALLOW`, `NGINX_WRONGWAY_RATE_LIMIT`, `NGINX_WRONGWAY_BURST`,
and `NGINX_CONTENT_SECURITY_POLICY` under
`artifacts/field-preflight/<timestamp>/manifest.json` plus `manifest.md`.
After `field:readiness`, run `npm.cmd run field:env-closeout -- --base-url=<delivery-url> --generated-by=<field-reviewer> --site-name=<delivery-site>` to generate
`artifacts/field-env-closeout/<timestamp>/manifest.json` and `manifest.md`.
That closeout board groups the redacted field `.env` gaps by owner, lists the
strict preflight command, gives key-specific actions without printing secret
values, and adds owner closeout checklists with reviewer/session metadata,
redacted key placeholders, and the strict preflight rerun command.
Use `-RequireDeviceKey`, `-RequireHttpsCookies`, `-RequireSwaggerAllowlist`,
and `-Strict` with `scripts/field-preflight.ps1` or `npm.cmd run field:preflight`
when those checks should fail instead of being recorded as review/skipped items.
Use `-StrictPreflight` only with `scripts/field-acceptance.ps1` or
`npm.cmd run field:acceptance`, where it is translated into the preflight
`-Strict` flag by the orchestrator.

The orchestrator runs `scripts/field-preflight.ps1`, `scripts/delivery-verify.ps1`, `scripts/runtime-smoke.ps1`,
`scripts/db-field-rehearsal.ps1`, `scripts/lidar-ingest-rehearsal.ps1`,
`scripts/control-board-field-rehearsal.ps1`, `npm.cmd run security:evidence`,
and `npm.cmd run delivery:evidence` in order, then records
`artifacts/field-acceptance/<timestamp>/manifest.json` plus `manifest.md`.
Use `-SkipDeliveryEvidence` only when `npm.cmd run delivery:evidence` is being
run separately; the field acceptance manifest records that package step as
SKIPPED and final handover remains REVIEW until delivery evidence is attached.
The manifest includes a `Field Acceptance Decision` summary with `-Reviewer`,
`-SiteName`, optional `-DecisionNote`, PASS/REVIEW/SKIPPED counts, handover
readiness, child evidence references, and next actions for the handover package.
The orchestrator also reads the latest preflight manifest and adds a
review/skipped gate when the preflight status is not `PASS`.
It also copies the latest preflight REVIEW/SKIPPED checks into `Preflight Open Items`, including next actions and close criteria, so acceptance reviewers can close preflight blockers from the acceptance package.
It also records an `operator UI browser walkthrough` gate. Pass
`-OperatorUiWalkthroughEvidence <path>` after capturing the delivery display
resolution walkthrough for login, dashboard status, DRY_RUN/LIVE_TCP state,
event detail, Devices, Event Log realtime/degraded state, and Swagger entrypoint.
Use `docs/ops/operator-ui-walkthrough-template.md` as the tracked template and
copy the filled field evidence to `artifacts/manual/operator-ui-walkthrough.md`
before attaching it to the acceptance run.
Without that evidence, the step remains REVIEW unless `-SkipOperatorUiWalkthrough`
is accepted by the field reviewer.
Handover readiness is true only when the overall status is `PASS`, the latest
preflight manifest status is `PASS`, and both `-Reviewer` and `-SiteName` are
recorded.
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
with a PASS manifest. Use `--replacement-owner` and `--target-recheck-date` to
record who owns the replacement PASS rehearsal and when it must be rechecked.
Use a concrete owner and a `YYYY-MM-DD` target recheck date; placeholder values
such as `TBD`, `unknown`, `pending`, `UNASSIGNED`, or
`REQUIRED_BEFORE_HANDOVER` leave owner/recheck status in REVIEW until final
handover.

Strict field acceptance example after the delivery stack is already running:

```powershell
$env:FIELD_REVIEWER="<actual reviewer name>"
$env:FIELD_SITE_NAME="<actual delivery site name>"
npm.cmd run field:acceptance -- -BaseUrl http://localhost:8080 -Reviewer "$env:FIELD_REVIEWER" -SiteName "$env:FIELD_SITE_NAME" -OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md -RequireDeviceKey -RequireHttpsCookies -RequireSwaggerAllowlist -StrictPreflight -IncludeContainerImages -IncludeZap -RequireScanners
```

After `npm.cmd run delivery:evidence`, run `npm.cmd run completion:audit`.
The audit writes `artifacts/completion-audit/<timestamp>/manifest.json` and
`artifacts/completion-audit/<timestamp>/manifest.md`, references the latest
delivery evidence, manual evidence readiness, and field readiness manifests, records redacted required field value states,
checks required manual evidence for `artifacts/manual/operator-ui-walkthrough.md` and
`artifacts/manual/field-risk-acceptance.md`, then sets
`canMarkGoalComplete` to `false` until automated checks pass and no field
readiness, companion, skipped, preflight, acceptance, required manual evidence, or
required verification item remains.
When `FIELD_REHEARSAL_UNAVAILABLE` manifests are present, confirm the audit's
`Field Rehearsal Follow-ups` table lists the replacement owner, target recheck
date, owner status, recheck status, reason, and source rehearsal manifest for
each DB, LiDAR, and control-board rehearsal item.

After `npm.cmd run completion:audit`, run
`npm.cmd run handover:index -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
The index writes `artifacts/handover-index/<timestamp>/manifest.json` and
`artifacts/handover-index/<timestamp>/manifest.md`, listing the latest required
delivery, completion, preflight, acceptance, field rehearsal, runtime, and
security manifests that should be attached to the handover package. If the
completion audit does not reference the latest delivery evidence manifest, the
index reports `STALE`; run `npm.cmd run completion:audit` and
`npm.cmd run handover:index -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"` again. If the field closure plan does not reference
the latest completion audit, the index also reports `STALE`; run
`npm.cmd run field:closure-plan -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"` and
`npm.cmd run handover:index -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"` again.
When unavailable rehearsal evidence is used, the index's
`Field Rehearsal Follow-ups` table must point to both the source rehearsal
manifest and the current field closure plan manifest.

After `npm.cmd run handover:index -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`, run
`npm.cmd run field:closure-plan -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
The closure plan writes `artifacts/field-closure-plan/<timestamp>/manifest.json`
and `manifest.md`, translating REVIEW, STALE, MISSING, and PASS_WITH_SKIPS
areas into ordered field commands, redacted required field value states, and
done-when criteria.
The `Field Rehearsal Follow-up Actions` table is the operator-facing closure
list for unavailable DB, LiDAR, and control-board rehearsal evidence; each row
must show the owner, target recheck date, next action, done-when condition, and
source manifest.

Before the final handover package, run
`npm.cmd run manual:evidence-drafts -- --base-url=http://localhost:8080 --site-name="$env:FIELD_SITE_NAME" --reviewer="$env:FIELD_REVIEWER"`
when `artifacts/manual/operator-ui-walkthrough.md` or
`artifacts/manual/field-risk-acceptance.md` is missing. It creates reviewer-fillable
drafts and writes `artifacts/manual-evidence-drafts/<timestamp>/manifest.json`
plus `manifest.md`. When a latest `field:risk-register` manifest exists, the
draft report also carries its copyable `Risk Acceptance Draft Rows` and uses
those rows to replace the generic accepted-item rows in a newly created
`artifacts/manual/field-risk-acceptance.md` draft. It also adds an operator UI
capture route checklist for `/login`, dashboard, wrong-way/event/device views,
settings control-board mode, statistics, and Swagger so reviewers can capture
the required screenshot and browser/network notes consistently. Existing manual
evidence files are preserved unless `--force` is used after backing up reviewer
content.

Then run
`npm.cmd run manual:evidence-readiness -- --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
It writes `artifacts/manual-evidence-readiness/<timestamp>/manifest.json` plus
`manifest.md`, summarizing the required manual evidence target files, template
paths, validation failures, and next actions. This report is a preparation
checklist only; it never substitutes for the reviewer-filled
`artifacts/manual/operator-ui-walkthrough.md` or
`artifacts/manual/field-risk-acceptance.md` files.

Before strict completion, run
`npm.cmd run field:readiness -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
The readiness report writes `artifacts/field-readiness/<timestamp>/manifest.json`
and `manifest.md`, checking Docker daemon reachability, Nginx/API health,
required `.env` posture, control-board TCP mode, Swagger exposure, and optional
security scanner availability without printing secret values. The control-board
safety status is recorded as `DRY_RUN_SAFE`, `LIVE_TCP_READY`, or
`LIVE_TCP_REVIEW`. The report also includes `Field Value Action Groups` and
`Field Value Action Items` so Auth/Security, LiDAR ingest, control-board TCP,
and Nginx delivery owners can close blocking `.env` values without exposing
secret values.

After field readiness and security evidence exist, run
`npm.cmd run field:risk-register -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
It writes `artifacts/field-risk-register/<timestamp>/manifest.json` plus
`manifest.md`, collecting open field values, strict scanner skips/failures,
remaining final-status gates, and required manual evidence into reviewer-facing
risk groups, `Owner Risk Briefs`, `Owner Risk Next Actions`, and structured
`Risk Acceptance Draft Rows`. This register is preparation evidence only;
accepted risk still requires the reviewer-filled
`artifacts/manual/field-risk-acceptance.md` file and must not include secret
values. Re-run `manual:evidence-drafts` after this step when the reviewer wants
the risk acceptance draft to include the latest register rows.

After final status exists, run
`npm.cmd run field:action-board -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
It writes `artifacts/field-action-board/<timestamp>/manifest.json` plus
`manifest.md`, grouping remaining final-status gates by owner, priority,
execution phase, mapped command, evidence path, done-when criteria, and a
phase-ordered `Execution Queue` of deduplicated commands. This board is an
execution aid for field owners; it does not replace final field evidence.

After the action board exists, run
`npm.cmd run field:gate-closure-map -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
It writes `artifacts/field-gate-closure-map/<timestamp>/manifest.json` plus
`manifest.md`, grouping the latest action board by command so reviewers can see
which final-status gates, owners, phases, evidence paths, and close criteria
each field command is expected to resolve. The `Execution Queue Linkage` table
preserves the action board queue order so execution and closure tracking use
the same command sequence.

After the action board exists, run
`npm.cmd run field:owner-briefs -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
It writes `artifacts/field-owner-briefs/<timestamp>/manifest.json`,
`manifest.md`, and one markdown file per owner. These briefs split the latest
action board into owner-specific commands, evidence paths, and close criteria
for field handoff, including `ownerBriefs`, `briefFileIndex`, and
owner-specific `Execution Queue` rows; they do not replace reviewer-filled
evidence.

For the final attachment refresh, run
`npm.cmd run handover:package -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`. Replace
the base URL with the delivery Nginx entrypoint when it is not localhost. It
runs `delivery:evidence`, `field:readiness`, `field:risk-register`, `manual:evidence-drafts`, `manual:evidence-readiness`, `field:action-board`, `field:gate-closure-map`, `field:owner-briefs`, `completion:audit`,
`field:closure-plan`, and `handover:index` in order, passing the same base URL
into the refreshed manual draft report, readiness report, risk register, action board, gate closure map, and owner briefs and indexing the refreshed closure plan, then writes
`artifacts/handover-package/<timestamp>/manifest.json` plus `manifest.md` with
the refreshed evidence references, command logs, base URL, strict gate reasons,
manual evidence draft/readiness/risk-register/action-board/gate-closure-map/owner-brief/final-bundle-handoff references, and latest control-board safety status. Attach the latest final bundle handoff when available so reviewers can open bundle-specific closeout files beside the handover package. The completion audit, handover index,
closure plan, and handover package all surface this status so `DRY_RUN_SAFE` or
`LIVE_TCP_REVIEW` cannot be mistaken for field-ready TCP operation. Use
`npm.cmd run handover:package -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME" --strict`
when the command should fail unless the package status is `READY` and
`canMarkGoalComplete=true`.
`final:refresh` may call `handover:package --reuse-existing-evidence` only after
the same refresh run has already regenerated delivery, readiness, manual,
field action, completion audit, closure plan, and handover index evidence. That
mode packages the latest evidence refs without rerunning the expensive refresh
commands; it is an orchestrator optimization, not a standalone final-close
proof.
The handover index marks completion audit evidence as `STALE` if it does not
reference the latest delivery evidence or the latest field readiness report.
Before sharing the package, review the handover package `Residual Field Gates`
table first. It is the shortest final-status view of open strict gates, manual
evidence gaps, field evidence review items, rehearsal follow-ups, and known
field limitations.
The handover package's `Field Evidence Follow-ups` table must match the latest
completion audit and closure plan follow-up owner/recheck information before
the package is shared.
Run `npm.cmd run verify:final-status` after the final handover package refresh.
This verifier checks that READY/COMPLETE claims require `canMarkGoalComplete=true`,
`LIVE_TCP_READY`, PRESENT manual evidence, a security evidence manifest,
non-blocking strict security evidence, empty `Residual Field Gates`, and fresh
delivery/readiness/manual-readiness/security/index/closure references.
Before the final report is shared, commit or intentionally clear local changes
and regenerate the handover/final evidence from the delivery revision. The final
status report includes `Source Revision Freshness`; any dirty working tree or
Git-bearing evidence generated from an older commit remains a no-close gate.
Then run
`npm.cmd run final:status -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"` to
write `artifacts/final-status/<timestamp>/manifest.json` plus `manifest.md`.
Use the same delivery Nginx base URL that was used for field readiness,
security evidence, runtime evidence, and the handover package; the report's
`Delivery Entrypoint Consistency` section opens a no-close gate when those
evidence URLs do not match the final status base URL.
Share this report as the final close/no-close decision. It reports
`READY_TO_CLOSE` only when completion audit, field readiness, strict scanner
security evidence, latest field acceptance `PASS`/`readyForHandover=true`
evidence, manual evidence, handover package readiness, residual field gates,
latest artifact references, and clean source revision evidence all agree;
otherwise it lists the
remaining gates under `FIELD_OR_SECURITY_REVIEW_REQUIRED`. Start with the
`Gate Action Summary` table: `AUTOMATED_REFRESH_AVAILABLE` items can usually be
refreshed by Codex, while `FIELD_ACTION_REQUIRED`, `MANUAL_EVIDENCE_REQUIRED`,
and `SECURITY_REVIEW_REQUIRED` need field runtime, reviewer evidence, or scanner
evidence before final close.

After the final status report, run
`npm.cmd run final:execution-plan -- --base-url=http://localhost:8080 --generated-by="$env:FIELD_REVIEWER" --site-name="$env:FIELD_SITE_NAME"`.
It writes `artifacts/final-execution-plan/<timestamp>/manifest.json` plus
`manifest.md`, grouping the latest `remainingGates` by action type and turning
them into an ordered command list for manual evidence readiness, action board,
field risk register, manual evidence drafts, field gate closure map, owner briefs, preflight, runtime smoke,
DB/LiDAR/control-board rehearsals, strict security evidence, field readiness,
field acceptance, source revision closeout (`git status --short --branch`;
`git push origin dev`), `verify:docs-text-quality`, `ci:closeout`, `ci:status`, `completion:audit`, `handover:index`,
`field:closure-plan`, strict `handover:package`, and final status refresh. The
final package refresh section intentionally lists both the source revision
closeout, the document text quality check, CI status evidence, standalone
index/closure commands, and the strict handover package command so reviewers
can push the final `dev` revision, confirm handover Markdown has no mojibake,
record the GitHub Actions result for that commit, refresh the evidence index,
generate `Field Action Artifact Actions`, and then rebuild the package from the
same delivery revision.
The `Closure Bundles` table compresses the open root causes into field-execution
packages. Work through the bundles in this order unless the field lead assigns a
different owner sequence:

1. `Field Input And Risk Acceptance`: fill `.env` field values, operator
   walkthrough evidence, risk acceptance evidence, and policy-dependent
   decisions.
2. `Runtime And Hardware Proof`: refresh runtime, DB/Prisma, LiDAR ingest, and
   control-board rehearsal evidence against the delivery Nginx entrypoint and
   approved field hardware.
3. `Security And CI Proof`: attach scanner evidence or accepted scanner risk
   rows, then record CI status for the final pushed `dev` commit.
4. `Final Handover Refresh`: regenerate field action artifacts, completion
   audit, handover package, final status, and final execution plan after the
   upstream bundles close.

Each closure bundle lists the related root causes, gate count, owners, evidence
targets, command IDs, intended outcome, and close condition. The bundle count is
a planning shortcut only; the final decision still comes from `final:status`.
The manual evidence section intentionally runs `field:risk-register` before
`manual:evidence-drafts` so newly created risk-acceptance drafts can include
the latest reviewer-copyable register rows before `manual:evidence-readiness`
validates the filled evidence.
This execution plan is an operator runbook only; it does not replace field
evidence and does not prove completion unless the refreshed final status says
`READY_TO_CLOSE`.

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
curl -c field-cookies.txt -b field-cookies.txt -H "Content-Type: application/json" -d "{\"userId\":\"<operator>\",\"password\":\"<password>\"}" http://localhost:8080/api/auth/login
curl -b field-cookies.txt http://localhost:8080/api/database/health
curl -b field-cookies.txt http://localhost:8080/api/status
curl -b field-cookies.txt http://localhost:8080/api/devices/status
```

Focused DB/Prisma field evidence:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/db-field-rehearsal.ps1 -BaseUrl http://localhost:8080
```

Use `-RunDeploy` and `-RunSeed` only when the field PostgreSQL target is
confirmed for migration/seed rehearsal. The script always records `db:status`,
operator cookie auth, `/api/database/health`, `/api/status`, `/api/devices/status`,
and configured site/zone/device API results under
`artifacts/field-db-rehearsal/<timestamp>/manifest.json` plus `manifest.md`.

Field topology verification:

```bash
curl -b field-cookies.txt http://localhost:8080/api/sites
curl -b field-cookies.txt http://localhost:8080/api/zones
curl -b field-cookies.txt http://localhost:8080/api/devices
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
commands, stage command mapping (`STAGE_1_ON`, `STAGE_2_ON`,
`STAGE_2_RETURN`), raw payload retention, summary KPI fields, and writes
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
npm run verify:control-board-tcp-simulator
npm run verify:control-board-simulator-rehearsal
npm run control-board:simulator-rehearsal
```

To rehearse the raw TCP ACK path before the real board is connected, run the
local simulator in a separate terminal:

```bash
npm run control-board:simulator -- --host=127.0.0.1 --port=19085
```

Then point a temporary local rehearsal environment at that port only after the
operator and hardware owner agree this is a simulator session:

```powershell
$env:CONTROL_BOARD_HOST="127.0.0.1"
$env:CONTROL_BOARD_PORT="19085"
$env:CONTROL_BOARD_DRY_RUN="false"
$env:CONTROL_BOARD_LIVE_APPROVED="true"
$env:CONTROL_BOARD_CONNECT_TIMEOUT_MS="1000"
$env:CONTROL_BOARD_RESPONSE_TIMEOUT_MS="1000"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl http://localhost:8080 -AllowLiveTcp
```

The focused `control-board:simulator-rehearsal` command writes
`artifacts/control-board-simulator-rehearsal/<timestamp>/manifest.json` plus
`manifest.md` without needing a separately managed terminal. This simulator
evidence proves the local TCP frame send, ACK parser validation, and response
timing capture path; it does not replace the final integrated control-board
LIVE TCP ACK evidence.

Focused command lifecycle rehearsal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/control-board-field-rehearsal.ps1 -BaseUrl http://localhost:8080
```

The script logs in with the seeded operator credentials, sends `STAGE_1_ON`,
`STAGE_2_ON`, and `STAGE_2_RETURN` through `/api/control-board/commands/test`,
checks `safetyStatus`, `liveTcpReady`, 10-byte `packetHex`, `DRY_RUN` status,
`DRY_RUN_SKIPPED_SEND` log evidence, `averageResponseMs`, and
`responseSampleCount`, and writes
`artifacts/field-control-board-rehearsal/<timestamp>/manifest.json` plus
`manifest.md`.

When moving to live TCP:

1. Set `CONTROL_BOARD_HOST` and `CONTROL_BOARD_PORT`.
2. Confirm the network path with the hardware owner.
3. Record hardware owner approval and set `CONTROL_BOARD_LIVE_APPROVED=true`.
4. Set `CONTROL_BOARD_DRY_RUN=false`.
5. Re-run `scripts/control-board-field-rehearsal.ps1` with `-AllowLiveTcp`, or send `STAGE_1_ON` from the operator UI manual command panel.
6. Confirm packet/response in `control_commands` and `control_command_logs`.
7. Restore `CONTROL_BOARD_DRY_RUN=true` after the test unless continuing field validation.

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
npm.cmd run security:evidence -- --include-container-images --include-zap --require-scanners --use-docker-scanners --target-url=http://localhost:8080
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/security-scan.ps1 -IncludeContainerImages -IncludeZap -RequireScanners
```

Use `--use-docker-scanners` when Docker is available but native scanner
commands are not installed. Use `--require-scanners` with
`npm.cmd run security:evidence` when skipped
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
- `artifacts/completion-audit/<timestamp>/manifest.json` and `artifacts/completion-audit/<timestamp>/manifest.md` from `npm run completion:audit`; confirm `canMarkGoalComplete` before declaring the project complete and confirm the `Field Rehearsal Follow-ups` table when unavailable rehearsal evidence is used.
- `artifacts/handover-index/<timestamp>/manifest.json` and `artifacts/handover-index/<timestamp>/manifest.md` from `npm run handover:index`; confirm `Field Rehearsal Follow-ups` links source rehearsal manifests to the latest closure plan.
- `artifacts/field-closure-plan/<timestamp>/manifest.json` and `manifest.md` from `npm run field:closure-plan`; confirm `Closure Command Queue` mirrors the latest final execution plan ordered commands, confirm `Field Rehearsal Follow-up Actions` lists owner, target recheck date, next action, and done-when criteria, and confirm status remains `OPEN` while completion blockers, field readiness open checks, open required field values, field rehearsal follow-ups, or manual evidence gaps remain.
- `artifacts/field-readiness/<timestamp>/manifest.json` and `manifest.md` from `npm run field:readiness`
- `artifacts/handover-package/<timestamp>/manifest.json` and `manifest.md` from `npm run handover:package`; confirm `Residual Field Gates` is empty before final READY handover and `Field Evidence Follow-ups` matches the latest audit/index/closure follow-up information.
- Confirm the handover package `Git commit`, `Git branch`, `Git upstream`, `Git upstream commit`, `Git pushed to origin/dev`, and `Working tree clean` fields match the dev revision being delivered.
- `npm.cmd run verify:final-status` or `npm run verify:final-status` result; confirm READY/COMPLETE claims use fresh referenced artifacts, including security evidence, and no residual field/security/manual gates.
- `artifacts/delivery/<timestamp>/runtime/**` companion runtime evidence generated by `npm run delivery:evidence`
- `artifacts/delivery/<timestamp>/security/**` companion security evidence generated by `npm run delivery:evidence`
- `artifacts/runtime/<timestamp>/manifest.md` and `manifest.json` from `npm run runtime:evidence`; this records `.env.example` key coverage, present `.env` keys, missing `.env` keys, and the smoke base URL without storing secret values.
- `docker compose config --quiet` result
- `npm.cmd run smoke` or `npm run smoke` result
- `npm.cmd run ci` or `npm run ci` result
- frontend lint result
- `npm.cmd run verify:audit-policy` or `npm run verify:audit-policy` result
- `artifacts/field-acceptance/<timestamp>/manifest.json` and `manifest.md` from `scripts/field-acceptance.ps1`
- operator UI browser walkthrough evidence passed through `scripts/field-acceptance.ps1 -OperatorUiWalkthroughEvidence <path>`
- `artifacts/field-preflight/<timestamp>/manifest.json` and `manifest.md` from `scripts/field-preflight.ps1`
- `npm.cmd run security:evidence` manifest under `artifacts/security/<timestamp>/`
- `scripts/runtime-smoke.ps1` result when Docker runtime smoke is available
- `artifacts/field-db-rehearsal/<timestamp>/manifest.json` and `manifest.md` from `scripts/db-field-rehearsal.ps1`
- `artifacts/field-lidar-rehearsal/<timestamp>/manifest.json` and `manifest.md` from `scripts/lidar-ingest-rehearsal.ps1`
- `artifacts/field-control-board-rehearsal/<timestamp>/manifest.json` and `manifest.md` from `scripts/control-board-field-rehearsal.ps1`
- `artifacts/control-board-simulator-rehearsal/<timestamp>/manifest.json` and `manifest.md` from `npm run control-board:simulator-rehearsal`
- `FIELD_REHEARSAL_UNAVAILABLE` REVIEW manifests from `npm run field:rehearsal-unavailable` when the Docker/runtime/hardware environment is unavailable
- raw `npm audit --workspaces` result
- `artifacts/security/**` security scan evidence, with skipped checks explained
- Swagger screenshots or exported API list
- System/device status API responses
- Lidar ingest curl request/response
- Control command DB rows or API response
- Known limitations and skipped checks
