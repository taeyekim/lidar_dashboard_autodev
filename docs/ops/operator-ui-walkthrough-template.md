# Operator UI Walkthrough Evidence Template

Use this template as the source for `artifacts/manual/operator-ui-walkthrough.md`
before running field acceptance with
`-OperatorUiWalkthroughEvidence artifacts/manual/operator-ui-walkthrough.md`.
Do not record passwords, JWTs, cookies, private IP ranges outside the approved
handover audience, or other secret values.
Empty session or reviewer decision values are not valid field evidence.
At least one `Evidence Files` path or reference must be filled before final
acceptance.

## Session

| Item | Value |
| --- | --- |
| Site name |  |
| Reviewer |  |
| Operator account |  |
| Browser and version |  |
| Delivery display resolution |  |
| Entry URL |  |
| Base API URL |  |
| Captured at |  |

## Required Screens

| Status | Screen | Evidence To Capture | Done When |
| --- | --- | --- | --- |
| TODO | Login | Login form, successful operator session, `/api/auth/me` state if inspected | Operator can sign in without exposing credentials in the evidence. |
| TODO | Dashboard | Server, detector, control-board status, latest event, latest command panel | Dashboard clearly shows current operating state and does not show placeholder or broken layout. |
| TODO | Control-board mode | DRY_RUN or LIVE_TCP state, `liveApproved`, packet hex, latest command status, `LIVE_TCP_APPROVAL_REQUIRED` if live send was blocked | Reviewer can distinguish dry-run, live approval, and approval-blocked live TCP before any barrier action. |
| TODO | Event detail | Raw LiDAR payload, wrong-way stage, linked command timeline, response/CRC if available | Wrong-way event can be traced from payload to control-board command evidence. |
| TODO | Devices | LiDAR PC, control board, connection/status history or empty configured state | Device status is understandable for operators and maintenance. |
| TODO | Event Log | Realtime connected/degraded/disabled state and polling fallback behavior | Operator can tell whether realtime updates are active or degraded. |
| TODO | Statistics | Daily, weekly, monthly, yearly normal/wrong-way counts and wrong-way rate | Unique vehicle counts and wrong-way rate are visible without manual DB inspection. |
| TODO | Swagger | `/api-docs` entrypoint, auth schemes, wrong-way/control-board endpoints | API docs are reachable only through the intended delivery exposure policy. |

## Evidence Files

| Type | Path Or Reference | Notes |
| --- | --- | --- |
| Screenshot |  |  |
| Browser console/network note |  |  |
| Related field acceptance manifest |  |  |
| Related handover package manifest |  |  |

## Reviewer Decision

| Item | Value |
| --- | --- |
| Walkthrough result | PASS / REVIEW |
| Accepted limitations |  |
| Required follow-up |  |
| Reviewer signature/name |  |
| Decision timestamp |  |
