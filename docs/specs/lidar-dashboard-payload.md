# 라이다 PC -> 대시보드 payload 규격

이 문서는 라이다 PC가 대시보드로 전송하는 HTTP JSON 데이터의 현재 기준입니다.

## 기본 연동 정보

- 방향: 라이다 PC -> 대시보드
- 방식: HTTP POST
- Content-Type: `application/json`
- endpoint: `/api/wrongway`

## type 값

라이다 PC가 `type`을 결정해서 보냅니다. 대시보드는 이 값을 다시 판단하지 않고 수신, 저장, 표시합니다.

| 값 | 의미 |
| --- | --- |
| `normal-driving` | 정주행 |
| `wrong-way-level-1` | 역주행 1차 감지 |
| `wrong-way-level-2` | 역주행 2차 감지 |
| `situation-ended` | 상황 종료 |

기존 호환을 위해 `wrong-way`가 들어오면 `warning_level` 또는 `stage` 값 기준으로 1차/2차 감지로 변환할 수 있습니다.

현재 구현은 라이다 PC가 보낸 `type`을 기준으로 저장, 표시, 통합제어보드 명령을 생성합니다. 대시보드는 아직 현장 측량 기준 없이 `wrong-way-level-1`을 자동으로 `wrong-way-level-2`로 승격하지 않습니다. 대시보드 측 자동 2차 승격은 측량/현장 기준이 확정된 뒤 별도 요구사항, API/DB 영향, 안전 검증, 현장 rehearsal 증적을 추가한 후 활성화합니다.

## 현재 예상 payload

```json
{
  "type": "wrong-way-level-1",
  "warning_level": 1,
  "timestamp": "2026-01-13T14:43:54.360258+09:00",
  "confidence": 0.95,
  "zone_id": "Z327",
  "track_id": "81760000-0000-0000-0000-000000000000",
  "message": "역주행 1차 감지",
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

## 필드 설명

| 필드 | 논리 이름 | 설명 |
| --- | --- | --- |
| `type` | 이벤트 유형 | `normal-driving`, `wrong-way-level-1`, `wrong-way-level-2`, `situation-ended`를 지원합니다. |
| `warning_level` | 경고 단계 | 0은 정주행/상황 종료, 1은 1차 감지, 2는 2차 감지입니다. |
| `timestamp` | 이벤트 발생 시간 | KST ISO 문자열 형식을 기대합니다. |
| `confidence` | 감지 신뢰도 | 표시/분석 참고값이며 대시보드 판단 기준으로 사용하지 않습니다. |
| `zone_id` | 감지 구역 ID | lanelet ID를 `Z01`, `Z327` 형태로 변환한 값입니다. |
| `track_id` | 객체/트래킹 ID | `stable_object_id` 기반 값으로 이해하고 있습니다. |
| `message` | 이벤트 요약 메시지 | 화면 표시용 메시지입니다. |
| `speed_ms` | 속도(m/s) | 추가 제공 가능성이 있는 필드입니다. |
| `speed_kmh` | 속도(km/h) | 추가 제공 가능성이 있는 필드입니다. |
| `object_class` | 객체 종류 코드 | DB에서는 enum으로 고정하지 않고 숫자로 저장합니다. |
| `uuid` | 객체 UUID | 라이다 PC 내부 객체 UUID입니다. |
| `description` | 감지 상세 설명 | 감지 사유 또는 상태 설명입니다. |
| `consecutive_count` | 연속 조건 충족 수 | 라이다 PC가 판단한 연속 역주행 프레임 수입니다. |
| `is_confirmed` | 확정 여부 | 라이다 PC가 판단한 역주행 확정 여부입니다. |
| `normal_moving_vehicle_count` | 정상 통과 차량 수 | KPI 표시 참고값입니다. |
| `raw_payload` | 원본 payload | 대시보드 DB에는 수신 원본 JSON을 보존합니다. |

## 추가 확인 중인 사항

- 현장 내부망 IP와 라이다 PC 실제 호출 URL
- `zone_id`와 내부 구역 코드 매핑표
- 정상 차량 수를 라이다 PC 값으로 볼지 DB 집계값으로 볼지 여부
- 1차에서 2차로 넘어가는 기준의 현장 조정 여부

## 제공되지 않는 것으로 보는 항목

- CCTV
- 스냅샷
- 영상 URL
- 번호판 인식 결과

위 항목은 라이다 PC 이벤트 JSON이 아니라 추후 별도 CCTV/카메라 연동 영역으로 봅니다.
