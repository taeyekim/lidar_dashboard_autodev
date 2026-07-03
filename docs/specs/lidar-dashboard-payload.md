# LiDAR PC -> Dashboard Payload Specification

This document defines the current HTTP JSON contract for LiDAR PC events sent to
the dashboard. The dashboard stores the original JSON payload for audit and
field troubleshooting.

## Transport

- Direction: LiDAR PC -> Dashboard
- Method: HTTP POST
- Content-Type: `application/json`
- Endpoint: `/api/wrongway`
- Optional security header: `X-Device-Key` when `DEVICE_INGEST_API_KEY` is set

## Event Types

The LiDAR PC should send an explicit `type`. The dashboard stores and acts on
that value; it does not infer a higher stage unless the payload explicitly says
so.

| Value | Meaning |
| --- | --- |
| `normal-driving` | Normal-direction vehicle observation |
| `wrong-way-level-1` | First-stage wrong-way detection |
| `wrong-way-level-2` | Second-stage wrong-way detection |
| `situation-ended` | End of the wrong-way situation |

For backward compatibility, `wrong-way`, `wrong_way`, or `WRONG_WAY` can be
normalized by `warning_level`, `warningLevel`, or `stage`: level `2` becomes
`wrong-way-level-2`; otherwise it becomes `wrong-way-level-1`.

The dashboard does not automatically escalate `wrong-way-level-1` to
`wrong-way-level-2` before field measurement criteria are approved. Dashboard
side level-2 escalation requires a separate requirement, API/DB impact review,
safety validation, and field rehearsal evidence.

## Representative Payload

```json
{
  "type": "wrong-way-level-1",
  "warning_level": 1,
  "timestamp": "2026-01-13T14:43:54.360258+09:00",
  "confidence": 0.95,
  "zone_id": "Z327",
  "track_id": "81760000-0000-0000-0000-000000000000",
  "message": "Wrong-way level 1 detected",
  "speed_ms": 2.835765050970876,
  "speed_kmh": 10.208754183495154,
  "object_class": 6,
  "uuid": "81760000",
  "description": "Wrong-way driving detected (Heading and Path Confirmed)",
  "consecutive_count": 3,
  "is_confirmed": true,
  "normal_moving_vehicle_count": 2
}
```

## Field Mapping

| Field | Alias Accepted | Description |
| --- | --- | --- |
| `type` | `event_type`, `eventType` | One of `normal-driving`, `wrong-way-level-1`, `wrong-way-level-2`, `situation-ended`. |
| `warning_level` | `warningLevel`, `stage` | `0` for ended/normal, `1` for stage 1, `2` for stage 2. |
| `timestamp` | `occurred_at`, `occurredAt` | Event occurrence time. ISO-8601 with timezone is expected. |
| `zone_id` | `zoneId` | External zone/lanelet code from the LiDAR system. |
| `track_id` | `trackId`, `object_id`, `objectId`, `uuid`, `object_uuid`, `objectUuid`, `stable_object_id`, `stableObjectId` | Stable object/track identifier. This is the primary DB de-duplication key. |
| `confidence` | - | LiDAR confidence score. Stored for display/audit; not used by the dashboard as an escalation threshold yet. |
| `message` | `summary` | Operator-readable event summary. |
| `speed_ms` | `speedMs` | Optional speed in m/s. |
| `speed_kmh` | `speedKmh` | Optional speed in km/h. |
| `object_class` | `objectClass` | Optional numeric object class. |
| `description` | `detail` | Optional detailed event description. |
| `consecutive_count` | `consecutiveCount` | Optional LiDAR-side consecutive detection count. |
| `is_confirmed` | `isConfirmed` | Optional LiDAR-side confirmation flag. |
| `normal_moving_vehicle_count` | `normalMovingVehicleCount` | Optional LiDAR-side normal vehicle count. The dashboard KPI uses DB unique track counts. |

## De-Duplication Rules

- `normal-driving` payloads upsert one `vehicle_tracks` row per stable
  `track_id`/alias and do not create `traffic_events` rows.
- Repeated `normal-driving` payloads for the same object update the same
  vehicle track and preserve the latest raw payload.
- Wrong-way payloads create or reuse unresolved `traffic_events` by stable
  track and event stage.
- `wrong-way-level-1` creates/reuses the stage-1 control command path only.
- `wrong-way-level-2` creates/reuses the stage-2 control command path only.
- `situation-ended` resolves active wrong-way events for the same stable track.
- `/api/events/summary` reports vehicle counts from DB unique vehicle tracks,
  not from the raw LiDAR count field.

## Pending Field Decisions

- Final dashboard PC URL and LiDAR PC source IP on the field LAN
- Final `zone_id` to site/zone mapping
- Level-2 escalation threshold if dashboard-side escalation is later approved
- Field acceptance of display labels and operational KPI wording

## Out Of Scope For This Payload

- CCTV stream URL
- Audio files
- Video storage URL
- License plate recognition result

Those items are not part of the current LiDAR event JSON and should be handled
as separate camera/CCTV integration requirements if needed later.
