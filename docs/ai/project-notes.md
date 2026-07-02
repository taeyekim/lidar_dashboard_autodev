# 현장 연동 테스트 curl

아래 명령어는 대시보드 백엔드가 `http://localhost:5000`에서 실행 중이라는 전제로 작성한다.
현장 서버 IP가 정해지면 `localhost`만 해당 IP로 바꿔서 사용한다.

## 1. 서버 상태 확인

```bash
curl http://localhost:5000/api/health
```

## 2. 라이다 공식 수신 테스트

```bash
curl -X POST http://localhost:5000/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"wrong-way-level-1\",\"warning_level\":1,\"timestamp\":\"2026-01-13T14:43:54.360258+09:00\",\"confidence\":0.95,\"zone_id\":\"Z327\",\"track_id\":\"81760000-0000-0000-0000-000000000000\",\"message\":\"역주행 1차 감지\",\"speed_ms\":2.83,\"speed_kmh\":10.2,\"object_class\":6,\"uuid\":\"81760000\",\"description\":\"Wrong-way driving detected\",\"consecutive_count\":3,\"is_confirmed\":true,\"normal_moving_vehicle_count\":2}"
```

## 3. 라이다 ingest 호환 경로 테스트

```bash
curl -X POST http://localhost:5000/api/ingest/lidar \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"normal-driving\",\"warning_level\":0,\"zone_id\":\"Z261\",\"track_id\":\"track-normal-001\",\"confidence\":1.0,\"message\":\"정주행\",\"normal_moving_vehicle_count\":2}"
```

## 4. 통합 제어보드 실제 ingest 수신 테스트

```bash
curl -X POST http://localhost:5000/api/ingest/control-board \
  -H "Content-Type: application/json" \
  -d "{\"packet\":\"02 A1 10 01 01 02 00 9B 03 0D\",\"zone_id\":\"ROUNDABOUT-01\",\"device_id\":\"CONTROL-BOARD-01\"}"
```

## 5. 통합 제어보드 mock ingest 수신 테스트

```bash
curl -X POST http://localhost:5000/api/ingest/control-board/mock \
  -H "Content-Type: application/json" \
  -d "{\"packet\":\"02 A1 20 01 01 02 00 CD 03 0D\",\"zone_id\":\"ROUNDABOUT-01\",\"device_id\":\"CONTROL-BOARD-MOCK-01\"}"
```

## 6. 통합 제어보드 serial reader 입력 형태 테스트

```bash
curl -X POST http://localhost:5000/api/ingest/control-board/serial/test \
  -H "Content-Type: application/json" \
  -d "{\"port\":\"COM3\",\"baudRate\":9600,\"samplePacket\":\"02 A1 10 02 02 02 00 1C 03 0D\"}"
```

## 7. 최근 이벤트 확인

```bash
curl "http://localhost:5000/api/events/recent?limit=10"
```

## 8. 이벤트 요약 확인

```bash
curl http://localhost:5000/api/events/summary
```

## 9. 제어 상태 확인

```bash
curl http://localhost:5000/api/control/status
```

# Project Notes

이 프로젝트는 라이다 대시보드이며, 팀 개발 환경 통일을 목표로 한다.

- 백엔드, 프론트엔드, 데모 서버를 같은 방식으로 실행하는 방향을 우선한다.
- 라이다 PC 연동 방식은 추가 협의가 필요하다.
- 관련 경로, 포트, 프로토콜, 실행 방식, 데이터 형식은 확정 전 임의 변경하지 않는다.
- 확정되지 않은 내용은 가정과 확인 필요 항목을 구분한다.
