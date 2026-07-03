# Field Risk Acceptance Evidence Template

Use this template when a field acceptance item cannot become a direct PASS but
the reviewer intentionally accepts the risk for the delivery environment. Save
the filled copy under `artifacts/manual/field-risk-acceptance.md` and reference
it from the handover package. Do not include secrets, JWTs, passwords, private
keys, or unrestricted internal network maps.

## Session

| Item | Value |
| --- | --- |
| Site name |  |
| Reviewer |  |
| Operator |  |
| Delivery host |  |
| Base URL |  |
| Acceptance date |  |

## Accepted Items

| Status | Area | Risk Accepted | Compensating Control | Evidence Reference | Expiry Or Recheck |
| --- | --- | --- | --- | --- | --- |
| TODO | DEVICE_INGEST_API_KEY | LiDAR/device ingest uses trusted-LAN exception instead of `X-Device-Key`. | Internal network isolation, approved sender IP, Nginx rate limit, and audit log review. |  |  |
| TODO | Security scanners | gitleaks, Trivy, or OWASP ZAP evidence is skipped because the tool is unavailable or not approved on the field PC. | Attach `npm run verify:audit-policy`, `npm run verify:security-runtime`, and reviewer-approved scanner installation follow-up. |  |  |
| TODO | Swagger exposure | Swagger remains available to an approved internal operator network. | `NGINX_SWAGGER_ALLOW` restricted to approved CIDR or explicit internal-only exception. |  |  |
| TODO | HTTPS cookie posture | HTTPS/TLS is deferred in an isolated same-site network rehearsal. | Record topology, use same-site Nginx entrypoint, and set `AUTH_COOKIE_SECURE=true` before HTTPS delivery. |  |  |
| TODO | Control-board live TCP | Real control board is not connected; dry-run evidence is accepted until hardware approval. | Keep `CONTROL_BOARD_DRY_RUN=true`; live TCP requires approved host/port and command/ACK evidence. |  |  |
| TODO | Runtime/hardware rehearsal | DB, LiDAR, or control-board rehearsal is unavailable on the current workstation. | Attach `FIELD_REHEARSAL_UNAVAILABLE` manifest and schedule replacement PASS rehearsal. |  |  |

## Reviewer Decision

| Item | Value |
| --- | --- |
| Decision | ACCEPTED / REJECTED / RECHECK_REQUIRED |
| Required follow-up |  |
| Follow-up owner |  |
| Target recheck date |  |
| Reviewer signature/name |  |
