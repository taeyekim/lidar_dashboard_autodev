# 프로젝트 현재 컨텍스트

이 문서는 라이다 역주행 대시보드 작업을 시작하기 전에 확인해야 하는 현재 기준입니다.

최신 상세 요구사항은 `docs/ai/field-system-requirements.md`를 우선 확인합니다.

## 프로젝트 목적

- 월출산휴게소 회전교차로 역주행 방지 시스템의 관제 대시보드를 개발합니다.
- 1차 목표는 라이다 PC에서 전송하는 역주행 이벤트를 수신하고 화면에 표시/기록하는 것입니다.
- 물리 장비 제어는 통합제어보드가 담당하며, 대시보드는 우선 관제 중심으로 개발합니다.

## 현재 시스템 주체

- 라이다 PC
  - 역주행 감지 로직을 수행합니다.
  - 대시보드로 HTTP JSON 이벤트를 전송합니다.
- 우리 대시보드
  - 라이다 PC 이벤트를 수신합니다.
  - 이벤트 알림, 로그, 상태, 이력을 표시합니다.
  - 운영자 또는 자동 정책에 따라 통합제어보드로 제어 명령을 보낼 수 있는 주체입니다.
- 통합제어보드
  - 차단기, 전광판, 스피커 등 물리 장비 제어를 담당합니다.
  - 대시보드에서 받은 명령을 실제 물리 장비 동작으로 변환하는 하드웨어 제어 주체입니다.
  - 대시보드와는 UTP 케이블 기반 이더넷 통신을 전제로 검토합니다.
  - Ethernet application transport는 TCP socket을 기본으로 하며, 10바이트 binary frame을 raw TCP payload로 전송하는 방향입니다.
  - 코드에는 통합제어보드 10바이트 패킷 parser와 CRC-8 검증 로직이 준비되어 있으며, 후속 단계에서 대시보드 outbound command packet 생성/송신 로직과 연결합니다.
  - 실제 물리 제어 실행 조건, 배선/종단/접지/통신 속도, 운영 권한과 실패 처리는 아직 정의가 필요합니다.

## 확정된 통신

- 라이다 PC -> 대시보드
  - HTTP
  - POST
  - JSON
  - endpoint: `/api/wrongway`

## 정의가 필요한 통신

- 대시보드 -> 통합제어보드
  - UTP 케이블 기반 이더넷 연결의 실제 네트워크 구성
  - TCP socket 기반 raw 10바이트 command packet 송신
  - 차단기/전광판/스피커 제어 요청 정책
  - 대시보드가 생성해 송신할 command packet 형식
  - 명령 감사 로그, 권한, 중복 전송 방지 기준
  - 실패 처리
  - 제어 우선권
  - 제어 로그 기준
- 통합제어보드 -> 대시보드
  - 대시보드 명령 접수 결과를 회신할지 여부
  - 제어 성공/실패 또는 장비 상태를 대시보드로 회신할지 여부
  - 10바이트 패킷과 CRC-8 검증 결과를 운영 상태/로그로 어떻게 노출할지 여부

## 실증 단계

- 1차: 라이다 PC와 대시보드 연동
- 2차: 대시보드와 통합제어보드 제어 요청 방식 검토
- 3차: 라이다 PC, 대시보드, 통합제어보드 전체 시스템 테스트

## 대시보드 1차 개발 범위

- `/api/wrongway` 수신
- 라이다 이벤트 표시
- 이벤트 로그/이력 표시
- 원본 payload 확인
- 수신 상태 확인
- JWT 기반 운영자 로그인/세션 처리
- Swagger/curl 기반 현장 테스트 지원

## 운영자 인증 범위

- 운영 화면은 JWT 로그인 후 접근하는 것을 기본으로 한다.
- 백엔드는 `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` 계약을 제공한다.
- 프론트엔드는 로그인 화면, 세션 복구, 401 만료 처리, 로그아웃, protected route를 제공한다.
- 사용자용 조회/수정 API는 JWT 보호 대상이다.
- 라이다 PC가 호출하는 `/api/wrongway`와 장비 ingest API는 JWT 보호 대상에서 제외하되, `DEVICE_INGEST_API_KEY`가 설정된 운영 환경에서는 `X-Device-Key` 헤더로 장비 요청을 검증한다.
- 현장 내부망에서는 Nginx allowlist, 방화벽, 포트 노출 정책으로 라이다 PC와 통합제어보드 접근 경로를 추가 제한한다.
- 실제 `JWT_SECRET`, 관리자 비밀번호, 비밀번호 hash는 `.env`에만 두고 문서/커밋에 남기지 않는다.

## 대시보드 UI 목표

- 첫 화면은 소개 페이지가 아니라 실제 관제 화면이어야 한다.
- 현재 역주행 위험, 최근 수신 이벤트, API/DB/WebSocket/라이다 수신 상태를 첫 화면에서 확인할 수 있어야 한다.
- 이벤트 상세에서는 상태, 메모, timeline, 원본 payload를 확인할 수 있어야 한다.
- mock, 미연동, 미검증 상태는 실제 연동 상태처럼 보이게 표현하지 않는다.
- CCTV, 번호판, 차량 소유자 등 현재 payload에 없는 정보는 제공하지 않는다.

## 백엔드/API 확장 범위

- `/api/events`, `/api/events/recent`, `/api/events/:id`, `/api/events/:id/logs`를 DB 기준 이벤트 조회 API로 정리한다.
- `sites`, `zones`, `devices`, `devices/status`, `system/status` 계열 read API를 추가한다.
- WebSocket은 DB 저장 이벤트 기준 canonical message를 제공하고, 프론트는 polling fallback을 가져야 한다.
- vehicle track lifecycle과 situation 종료 정책은 raw payload 보존과 adapter 확장성을 해치지 않는 범위에서 점진 도입한다.

## 운영/납품 인프라 범위

- 납품/운영 구성에서는 Nginx reverse proxy를 중간 진입점으로 두는 방안을 검토한다.
- Nginx는 프론트 정적 파일, `/api` 백엔드 프록시, WebSocket upgrade, Swagger 접근 정책, health endpoint, security header를 담당할 수 있다.
- 현장망에서는 외부 노출 포트, Windows 방화벽 inbound, Docker network, DB 외부 비노출, 라이다 PC 접근 경로를 명확히 해야 한다.
- TLS 인증서, 도메인, 현장 IP, 내부망 값은 문서/커밋에 실제값을 남기지 않고 placeholder로 관리한다.
- 개발용 `localhost` 실행과 납품용 Nginx 경유 실행은 문서에서 분리한다.

## 보안 검사/납품 검수 범위

- 납품 전에는 dependency audit, secret scan, container scan, SAST 후보, DAST 후보, 수동 보안 점검을 계획한다.
- OWASP ASVS 같은 웹앱 보안 검증 기준과 OWASP ZAP Baseline 같은 passive DAST를 참고할 수 있다.
- JWT, CORS, security headers, Swagger 노출, raw payload 노출, 로그 민감값, Nginx proxy header, rate limit을 점검한다.
- 실제 장비나 물리 제어에 영향을 줄 수 있는 active scan은 별도 안전 조건 전까지 수행하지 않는다.
- 보안 검사 결과와 납품 검수 결과는 `통과`, `차단`, `납품 전 수정`, `위험 수용`, `미검증`으로 구분한다.

## 하드웨어/통합제어보드 자문 범위

- 하드웨어 전문가 에이전트는 UTP 기반 이더넷 배선, 포트, 스위치, IP/port, 통신 안정성, 노이즈, 현장 장비 안전 조건을 자문한다.
- 첨부 PDF에 `RS-485`로 적힌 물리 계층 내용은 기존 초안/참고로 보며, 실제 개발 기준은 UTP Ethernet 전제다.
- 현재 준비된 CRC-8 검증 로직과 10바이트 패킷 parser는 문서, Swagger, 현장 테스트 벡터와 계속 대조한다.
- 후속 구현은 대시보드가 command packet을 생성해 통합제어보드로 송신하고, 통합제어보드의 접수/결과/상태 응답을 다시 수신하는 방향으로 설계한다.
- 통합제어보드 IP, port, timeout, retry, heartbeat, dry-run 여부는 `.env`에서 관리한다.
- HTTP mock, loopback, 브릿지 프로그램, transport adapter, 실제 장비 연결 테스트를 단계별로 분리한다.
- 실제 물리 제어는 별도 안전 조건과 운영 권한이 정리되기 전까지 실행하지 않는다.

## 현재 범위에서 제외

- 대시보드의 라이다 판단 로직 구현
- 대시보드가 통합제어보드를 거치지 않고 차단기를 직접 제어하는 로직
- 통합제어보드 물리 제어 로직 구현
- CCTV, 스냅샷, 영상 URL 연동
- 대시보드 자체 1차/2차 알림 판단

## 개발 방향

- 원본 payload는 가능한 한 보존합니다.
- 라이다 PC 데이터 해석은 adapter 계층에 격리합니다.
- 아직 확정되지 않은 필드는 확정된 것처럼 구현하지 않습니다.
- 통합제어보드 제어 기능은 Ethernet/CRC 진단과 command boundary를 먼저 준비하고, 실제 물리 제어는 별도 안전 조건 정의 후 진행합니다.
