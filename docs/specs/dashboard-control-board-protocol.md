# 대시보드 -> 통합제어보드 프로토콜 정의

이 문서는 대시보드가 통합제어보드에 제어 요청을 보내야 할 경우 정의해야 하는 항목을 정리합니다.

최신 전체 요구사항은 `docs/ai/field-system-requirements.md`를 우선합니다.

## 현재 상태

- 통합제어보드는 차단기, 전광판, 스피커 등 물리 장비 제어를 담당합니다.
- 대시보드와 통합제어보드는 UTP 케이블 기반 이더넷 통신을 전제로 검토합니다.
- Ethernet application transport는 TCP socket을 기본안으로 사용합니다.
- command payload는 별도 wrapper 없이 10바이트 binary frame을 raw TCP payload로 전송합니다.
- 서버 코드에는 통합제어보드 10바이트 packet parser와 CRC-8 검증 로직이 준비되어 있습니다.
- 후속 구현은 대시보드가 command packet을 생성해 통합제어보드로 송신하고, 통합제어보드가 접수/결과/상태 응답을 회신하는 방향으로 설계합니다.
- 실제 현장 결선, 통신 속도, 제어 권한, 실패 처리, 물리 제어 실행 조건은 아직 정의가 필요합니다.
- 첨부 PDF에는 RS-485 물리 계층과 `라이다 PC -> 개발보드` 방향으로 적힌 부분이 있으나, 본 프로젝트에서는 UTP Ethernet 기반 `대시보드 -> 통합제어보드` 명령 프로토콜로 재해석합니다.

## 현재 코드 기준 packet 전제

- packet 길이: 10바이트 고정
- Byte 0: `STX`
- Byte 1: 장비 ID
- Byte 2: TYPE
- Byte 3: MODE
- Byte 4: STATUS
- Byte 5: SELECT
- Byte 6: RESERVED
- Byte 7: CRC
- Byte 8: `ETX`
- Byte 9: EOF 또는 CR
- CRC 계산 범위: Byte 1~6
- CRC 방식: CRC-8/SMBUS 계열 구현을 사용하며, 현장 테스트 벡터와 계속 대조합니다.
- 대시보드가 통합제어보드로 명령을 보낼 때도 동일한 frame 구조와 CRC 계산 범위를 기준으로 command packet을 생성합니다.
- 통합제어보드 응답 packet은 동일 parser/CRC 검증 흐름으로 진단하고, 명령 접수/성공/실패/상태 정보를 운영 로그로 남깁니다.

## 하드웨어 확인 필요 항목

- UTP 케이블 pin mapping
- Ethernet 연결 방식, 스위치/허브 사용 여부
- 통합제어보드 IP/port
- TCP socket server/client 역할
- timeout, retry, heartbeat, reconnect 기준
- 접지/쉴드/노이즈 처리
- 최대 케이블 길이와 노이즈 환경
- loopback 또는 브릿지 프로그램으로 실제 장비 연결 전 packet/CRC를 확인하는 절차
- 실제 장비 연결 시 물리 동작을 막는 안전 모드 또는 test mode 존재 여부

## 정의해야 할 통신 방향

- 대시보드 -> 통합제어보드
  - 수동 제어 요청
  - 대시보드가 생성한 제어 command packet 송신
  - 명령 전송 전 권한, 감사 로그, 중복 전송 방지, 안전 조건 확인
- 통합제어보드 -> 대시보드
  - 명령 접수 결과
  - 제어 성공/실패 결과
  - 장비 상태 회신 여부

## 정의해야 할 제어 대상

- 차단기
- 전광판
- 스피커
- 기타 현장 장비

## 정의해야 할 명령 예시

- 차단기 상승 요청
- 차단기 하강 요청
- 경고 표시 시작 요청
- 경고 표시 종료 요청
- 전체 상황 해제 요청
- 장비 상태 조회 요청

## 필수 검토 항목

- 통신 방식
  - UTP 케이블 기반 Ethernet
  - TCP socket raw binary frame
  - HTTP bridge는 테스트 또는 보조 adapter 후보
  - UDP는 유실 가능성 때문에 기본안에서 제외
  - 테스트용 HTTP mock/loopback endpoint 유지 여부
- 요청 형식
- 응답 형식
- 실패 처리
- timeout 기준
- 재시도 기준
- 제어 우선권
- 관리자 권한
- 제어 로그 저장 기준
- 실제 장비 상태 확인 방식

## 개발 원칙

- 대시보드는 물리 장비를 직접 제어하지 않습니다.
- 대시보드는 통합제어보드에 UTP Ethernet 기반 command packet 형태로 제어 요청을 보낼 수 있습니다.
- 기본 구현은 TCP socket으로 10바이트 command packet을 raw 전송합니다.
- 통합제어보드 IP/port, timeout, retry, heartbeat, dry-run 여부는 `.env`에서 관리합니다.
- 실제 장비 test/safety mode가 없으므로, 대시보드 소프트웨어에서 mock/dry-run/loopback adapter를 제공해야 합니다.
- 실제 차단기/전광판/스피커 제어는 통합제어보드가 담당합니다.
- 제어 기능은 권한, 로그, 실패 처리, 우선권 정책이 정의된 뒤 구현합니다.
- command packet 생성/송신, 응답 packet 수신/검증, 운영 로그 저장은 하나의 명령 lifecycle로 관리합니다.
- 실제 장비 연결 전에는 mock, loopback, serial test, bridge 프로그램 단계를 분리해 검증합니다.
- CRC-8 검증 실패 packet은 운영 이벤트로 전파하지 않고 진단 로그로 남깁니다.
