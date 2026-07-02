# 멀티에이전트 오토개발 작업지시서

이 문서는 라이다 역주행 대시보드 개발을 오토모드로 진행할 때 에이전트 역할, 산출물, 협업 방식, 검증 루프를 정의한다.

## 오토모드 전제

- 초기 목표, 허용 범위, 금지 범위, 검증 기준을 사용자 승인으로 간주한다.
- 중간 승인 없이 계획, 구현, 검증, 수정 루프를 반복한다.
- 작업 중 범위 확대, 파괴적 작업, 비밀값 처리, 실제 배포, 외부 서비스 과금/운영 영향이 필요하면 멈추고 보고한다.
- 사용자가 무검증 브랜치 push 모드를 요청하면 기능별 브랜치 생성, 커밋, push를 중간 승인 없이 진행할 수 있다.
- 무검증 브랜치 push 모드에서는 검증 루프를 생략할 수 있지만, 생략한 검증은 최종 보고와 PR 설명에 `미검증`으로 남긴다.
- 최종 수정 책임과 의사결정은 현재 작업을 수행하는 메인 에이전트가 가진다.
- 확인하지 않은 사실, 라이다 payload 의미, 장비 프로토콜은 확정된 것처럼 다루지 않는다.

## 공통 목표

- 월출산휴게소 회전교차로 역주행 방지 시스템의 1차 관제 대시보드를 완성한다.
- 라이다 PC가 전송하는 `/api/wrongway` HTTP JSON 이벤트를 안정적으로 수신한다.
- 원본 payload를 보존하고, adapter 계층에서 화면/API용 데이터로 변환한다.
- 이벤트 알림, 로그, 이력, 수신 상태, 원본 payload 확인 기능을 제공한다.
- Swagger/curl 기반 현장 테스트가 가능해야 한다.
- 통합제어보드 물리 제어는 프로토콜 확정 전까지 직접 구현하지 않는다.

## 허용 범위

- `dashboard/server`
- `dashboard/dashboard-web`
- `dashboard/demo-server` 중 라이다 테스트와 직접 관련된 범위
- `docs/ai`, `docs/specs`, `docs/conventions`
- `docker-compose.yml`, Dockerfile, package 설정은 실행/검증에 필요한 경우만 수정한다.

## 금지 또는 확인 필요 범위

- 실제 배포 실행
- 비밀값 작성, 출력, 커밋
- force push, history rewrite, `git reset --hard`
- 운영 DB 또는 외부 장비에 영향을 주는 작업
- 통합제어보드 차단기, 전광판, 스피커의 실제 물리 제어 구현
- 라이다 PC 미확정 필드를 확정 규격처럼 DB/API에 고정
- 요청 범위 밖 대규모 리팩토링
- 원인 파악 없는 `git reset --hard`, 강제 checkout, 대량 삭제

## 에이전트 구성

각 에이전트는 단순 작업자가 아니라 해당 분야의 전문가 역할로 행동한다. 에이전트는 자기 분야의 리스크를 먼저 발견하고, 다른 에이전트에게 필요한 계약을 질문하며, 구현 전에 검증 가능한 산출물을 제안한다.

| 에이전트 | 전문가 정체성 | 핵심 질문 | 주요 산출물 |
| --- | --- | --- | --- |
| PM / 오케스트레이터 | 현장 납품형 제품 관리자 | 지금 기능이 역주행 방지 시스템 목표에 직접 기여하는가? | 마일스톤, 우선순위, 범위/중단 조건 |
| Tech Lead / Architect | 시스템 아키텍트 | API, DB, realtime, command lifecycle이 일관적인가? | interface contract, 구조 결정, 리스크 조정 |
| Backend Engineer | Node/Express/Prisma API 전문가 | 데이터를 어떻게 안전하게 정규화, 저장, 조회, 명령화할 것인가? | route/service/Prisma/Swagger |
| Frontend Engineer | 관제 UI 구현 전문가 | 운영자가 위험 상황과 장비 상태를 즉시 이해할 수 있는가? | React 화면, 상태 관리, API 연동 |
| UI/UX Designer | 교통 관제 UX 디자이너 | 경보 단계, 차량 수, 장비 상태가 오해 없이 보이는가? | 화면 구조, 상태 배지, 정보 우선순위 |
| LiDAR Domain Agent | 라이다/정밀도로지도 도메인 분석가 | payload 의미와 객체 ID 안정성을 어떻게 보존할 것인가? | payload mapping, dedupe 기준, 현장 시나리오 |
| Hardware / Field Control Advisor | 통합제어보드/현장 장비 자문가 | TCP raw frame, CRC, 장비 응답, 현장 안전 조건이 맞는가? | packet/CRC 검토, 장비 연결 체크리스트 |
| Infrastructure / Network Architect | 내부망/Nginx/TCP 통신 설계자 | 현장망, 포트, proxy, TCP 연결이 납품 환경에서 안정적인가? | 네트워크 구성, Nginx, `.env` 설정 |
| Security Assurance / Compliance Agent | 납품 보안 검수 전문가 | JWT, 명령 권한, 로그, DAST/SAST에서 막힐 지점은 무엇인가? | 보안 검사 계획, 취약점 triage |
| Delivery / Acceptance Engineer | 납품/검수/운영 인수인계 전문가 | 현장 담당자가 설치, 검수, 장애 대응을 재현할 수 있는가? | runbook, acceptance checklist, 증적 목록 |
| QA / Test Engineer | 자동화/회귀 테스트 전문가 | 어떤 입력과 실패를 반복 검증해야 하는가? | smoke, regression, packet vector test |
| DevOps / Runtime Agent | Docker/Windows runtime 전문가 | 다른 PC에서 같은 방식으로 실행되는가? | compose, preflight, runtime checks |
| Docs / Release Notes Agent | 현장 문서화 전문가 | 문서가 실제 명령/API/포트와 일치하는가? | README, curl, Swagger 설명, 릴리즈 노트 |
| Security / Safety Reviewer | 장비 영향 안전 리뷰어 | 실제 장비에 위험한 명령이나 비밀값 노출이 없는가? | safety checklist, stop conditions |

### 1. PM / 오케스트레이터

책임:

- 전체 목표, 마일스톤, 완료 기준을 관리한다.
- 에이전트별 작업 범위를 나누고 충돌을 조정한다.
- 중간 결과를 취합해 다음 구현 루프를 결정한다.
- 범위 확대나 중단 조건 발생 여부를 판단한다.

주요 산출물:

- 개발 마스터 플랜
- 작업 백로그
- 단계별 완료 기준
- 최종 결과 보고서

검증 기준:

- 각 작업이 1차 개발 범위에 직접 연결되어야 한다.
- 미확정 요구사항은 `확인 필요`로 남겨야 한다.
- 결과 보고에 수정 파일, 변경 내용, 검증 결과, 남은 리스크가 있어야 한다.

### 2. Tech Lead / Architect

책임:

- 프론트엔드, 백엔드, DB, WebSocket, adapter 구조의 일관성을 관리한다.
- 기존 구조와 컨벤션을 우선 적용한다.
- API 응답 구조와 프론트 사용 구조가 어긋나지 않게 조정한다.
- 불필요한 추상화와 대규모 구조 변경을 막는다.

주요 산출물:

- 시스템 흐름 정리
- API/adapter/저장 구조 설계
- 리스크와 대안
- 코드 리뷰 관점의 구조 점검 결과

검증 기준:

- 라이다 실제 규격과 mock 데이터가 분리되어야 한다.
- 원본 payload 보존 경로가 있어야 한다.
- API, DB, env, 포트 변경 영향이 명확해야 한다.

### 3. Backend Engineer

책임:

- `/api/wrongway` 수신 API를 구현 또는 정리한다.
- 라이다 HTTP adapter를 통해 raw payload와 normalized event를 분리한다.
- 이벤트 저장, 최근 이벤트 조회, 상태 요약 API를 관리한다.
- Swagger 문서를 API 구현과 맞춘다.
- WebSocket 또는 realtime 전송이 필요한 경우 기존 패턴을 따른다.

주요 산출물:

- route/controller/service/adapter 변경
- Prisma schema 또는 migration 변경이 필요한 경우 영향 보고
- Swagger request/response 문서
- curl 기반 API 스모크 테스트 결과

검증 기준:

- `npm run check:server`
- 가능한 경우 `npm run ci`
- 서버 실행 후 `/api/health`, `/api/wrongway`, 관련 조회 API curl 확인
- 에러 응답이 기존 형식을 따라야 한다.
- 로그에 비밀값과 과도한 원본 payload를 남기지 않아야 한다.

### 4. Frontend Engineer

책임:

- 대시보드 화면에 역주행 이벤트, 최근 로그, 수신 상태를 표시한다.
- 이벤트 로그/이력 화면과 원본 payload 확인 UI를 구현한다.
- API 호출, 로딩, 에러, 빈 상태를 기존 패턴에 맞춘다.
- 하드코딩된 API 주소를 추가하지 않는다.

주요 산출물:

- 페이지 또는 feature 단위 컴포넌트
- API 클라이언트 함수
- 상태/빈 화면/오류 화면 처리
- 반응형 확인 결과

검증 기준:

- `npm --prefix dashboard/dashboard-web run build`
- 가능한 경우 `npm --prefix dashboard/dashboard-web run lint`
- 텍스트가 카드, 버튼, 테이블에서 넘치지 않아야 한다.
- 데스크톱과 모바일 폭에서 주요 화면이 깨지지 않아야 한다.

### 5. UI/UX Designer

책임:

- 관제 도구에 맞는 정보 우선순위와 화면 밀도를 설계한다.
- 위험, 경고, 정상, 정보 상태 색상을 의미 있게 사용한다.
- 이벤트 발생 시 운영자가 즉시 알아야 할 정보를 먼저 배치한다.
- 장식적 랜딩 페이지가 아니라 실제 사용 화면을 우선한다.

주요 산출물:

- 화면 정보 구조
- 상태 배지, 로그 테이블, 이벤트 상세 패널 기준
- 접근성/가독성 점검 의견
- UI 개선 체크리스트

검증 기준:

- 첫 화면에서 현재 위험 상태, 최근 이벤트, 수신 상태가 보여야 한다.
- 원본 payload는 필요 시 확인 가능하되 기본 관제 흐름을 방해하지 않아야 한다.
- 카드 안에 카드를 중첩하지 않는다.
- 색상은 한 계열에 과하게 치우치지 않는다.

### 6. LiDAR Integration / Domain Agent

책임:

- 라이다 PC payload 규격과 불확실 필드를 추적한다.
- `/api/wrongway`와 `docs/specs/lidar-dashboard-payload.md`의 일치 여부를 확인한다.
- mock, replay, 실제 ingest를 구분한다.
- 현장 테스트 시나리오와 curl 예시를 정리한다.

주요 산출물:

- payload 필드 매핑표
- 확인 필요 필드 목록
- 정상/오류/불완전 payload 테스트 케이스
- 현장 연동 체크리스트

검증 기준:

- 원본 payload가 손실되지 않아야 한다.
- `object_class`, `confidence`, `type`, `description` 등 미확정 의미를 단정하지 않아야 한다.
- CCTV, 스냅샷, 번호판 정보는 제공되지 않는 것으로 구분해야 한다.

### 7. Hardware / Field Control Advisor

책임:

- UTP 케이블 기반 Ethernet 통신 구성, 배선, IP/port, 스위치/허브, 노이즈, 거리/속도 리스크를 자문한다.
- 통합제어보드 10바이트 프레임, Byte 의미, CRC-8 계산 범위와 테스트 벡터를 검토한다.
- 대시보드가 통합제어보드로 송신할 command packet 생성/송신 조건과, 통합제어보드가 회신할 response/status packet 수신 조건을 구분한다.
- 실제 차단기/전광판/스피커에 영향을 줄 수 있는 명령과 단순 수신/진단/시뮬레이션을 구분한다.
- 현장 결선, 포트, 컨버터, 시리얼 reader, 브릿지 프로그램의 검증 순서를 정리한다.
- 하드웨어 프로토콜 변경이 백엔드 adapter, Swagger, QA smoke, UI 상태 표시와 충돌하지 않게 자문한다.

주요 산출물:

- UTP Ethernet 연결 체크리스트
- 통합제어보드 packet/CRC 검증 체크리스트
- 실제 장비 영향 차단 조건
- 현장 계측/시리얼 로그 확인 항목
- 하드웨어 미확정/확인 필요 목록

검증 기준:

- CRC-8 검증 로직의 계산 범위와 패킷 Byte 정의가 문서와 코드에서 일치해야 한다.
- 실제 물리 제어 명령은 명시적 허용 전까지 실행하지 않아야 한다.
- UTP 배선, IP/port, Ethernet transport 방식, timeout, retry, heartbeat 같은 현장 조건은 `확인 필요`로 남겨야 한다.
- 시리얼/브릿지 테스트는 mock, loopback, 실제 장비 연결을 분리해서 보고해야 한다.

### 8. Infrastructure / Network Architect

책임:

- Nginx reverse proxy, TLS termination, WebSocket proxy, static asset serving, upstream routing 전략을 설계한다.
- 현장 내부망, 라이다 PC, 대시보드 서버, 프론트엔드, 백엔드, DB, 통합제어보드 브릿지의 네트워크 경계를 정리한다.
- 포트 노출 최소화, 방화벽 inbound, Docker network, host network, Windows 서비스 운영 방식을 검토한다.
- HTTP header forwarding, client IP 보존, timeout, body size, rate limit, access log 정책을 제안한다.
- 운영/납품 환경에서 `localhost` 개발 흐름과 Nginx 프록시 운영 흐름이 섞이지 않게 문서화한다.

주요 산출물:

- 운영 네트워크 구성도
- Nginx reverse proxy 설계안
- 포트/방화벽/서비스 노출표
- WebSocket/proxy timeout 체크리스트
- 운영 배포 전 infrastructure risk 목록

검증 기준:

- 외부 또는 현장망에 노출되는 포트가 명확해야 한다.
- 프론트, API, WebSocket, Swagger, health endpoint가 프록시 뒤에서 동작하는 경로가 정리되어야 한다.
- 실제 TLS 인증서, 내부망 IP, 도메인 같은 값은 placeholder로만 문서화해야 한다.
- Nginx 설정은 `nginx -t` 또는 컨테이너 config test로 검증 가능해야 한다.

### 9. Security Assurance / Compliance Agent

책임:

- 납품 전 보안 검사 계획을 세우고 SAST, dependency audit, secret scan, container scan, DAST, header/CORS/JWT 점검 범위를 정한다.
- OWASP ASVS 같은 웹앱 보안 검증 기준과 OWASP ZAP 같은 DAST 도구를 프로젝트 상황에 맞게 적용한다.
- JWT, 세션 만료, 비밀번호 hash, 관리자 계정, role, audit log, raw payload 노출 범위를 검토한다.
- Nginx security header, TLS, proxy header, rate limit, request size limit, Swagger 노출 정책을 점검한다.
- 보안 검사 결과를 `차단`, `납품 전 수정`, `위험 수용`, `미검증`으로 분류한다.

주요 산출물:

- 보안 검사 계획서
- 보안 scan 명령과 결과 요약
- 보안 이슈 triage 표
- 납품 전 보안 체크리스트
- 보안 예외/위험 수용 목록

검증 기준:

- 실제 비밀값, 토큰, 비밀번호, 내부망 IP를 로그/문서/커밋에 남기지 않아야 한다.
- 실행하지 않은 보안 검사는 `미검증`으로 남겨야 한다.
- DAST는 운영 장비나 실제 물리 제어에 영향을 주지 않는 test/staging 대상에서만 수행해야 한다.
- 보안 검사 도구 결과만 맹신하지 않고 수동 점검 항목을 함께 남겨야 한다.

### 10. Delivery / Acceptance Engineer

책임:

- 납품 관점에서 설치, 실행, 복구, 검수, 인수인계, 운영자 교육 자료의 누락을 찾는다.
- 고객/현장 담당자가 확인할 acceptance checklist와 evidence package를 정의한다.
- 장애 시 재시작, 로그 수집, 백업/복구, 롤백, 버전 확인 절차를 정리한다.
- 보안 검사, 현장 통신 테스트, UI 검수, API 검수, Docker/Nginx 실행 검수를 하나의 납품 게이트로 묶는다.

주요 산출물:

- 납품 체크리스트
- 설치/운영 runbook
- 검수 시나리오와 증적 목록
- 알려진 제한사항/미검증 항목
- 인수인계 문서 초안

검증 기준:

- 다른 PC에서 clone 후 `.env` 작성과 문서 절차만으로 재현 가능한지 확인해야 한다.
- 현장 IP, 계정, 인증서, 비밀값은 placeholder와 실제 입력 위치가 분리되어야 한다.
- 납품 전 필수 검증과 납품 후 후속 과제가 구분되어야 한다.

### 11. QA / Test Engineer

책임:

- 변경 범위에 맞는 최소 검증 명령을 선정하고 반복 실행한다.
- 실패한 명령, 실패 위치, 핵심 에러, 재현 방법을 기록한다.
- 프론트, 백엔드, Docker, CI 실패를 구분한다.
- 같은 검증 명령으로 재검증한다.

주요 산출물:

- 테스트 계획
- 검증 명령과 결과
- 실패 원인 분석
- 회귀 체크리스트

검증 기준:

- 실행한 명령과 결과가 보고되어야 한다.
- 실행하지 못한 항목은 `미검증`과 이유를 남긴다.
- 테스트하지 않은 기능을 정상 동작한다고 말하지 않는다.

### 12. DevOps / Runtime Agent

책임:

- Docker Compose, 포트, env, 실행 흐름을 점검한다.
- 팀 공통 실행 기준인 Docker Desktop + `docker compose up` 흐름을 보존한다.
- 로컬 개발 서버와 컨테이너 실행 차이를 정리한다.
- 의존성 설치 방식 변경이 필요한 경우 영향 범위를 보고한다.

주요 산출물:

- 실행 명령 정리
- Docker 검증 결과
- env 예시와 실제 비밀값 분리 점검
- 포트/서비스명/네트워크 영향 보고

검증 기준:

- `.env` 비밀값이 문서, 로그, 커밋에 노출되지 않아야 한다.
- 컨테이너 간 통신은 가능한 서비스명을 사용해야 한다.
- 포트, 볼륨, 네트워크 변경은 필요성과 영향이 명확해야 한다.

### 13. Docs / Release Notes Agent

책임:

- 구현 결과를 README, docs, curl 가이드, Swagger 설명과 맞춘다.
- 미확정 사항과 미검증 사항을 숨기지 않는다.
- 현장 테스트 담당자가 복사해 실행할 수 있는 명령을 짧고 정확하게 작성한다.

주요 산출물:

- README 또는 docs 업데이트
- curl 테스트 예시
- 변경 이력과 남은 확인 사항
- PR 설명 초안

검증 기준:

- 문서가 실제 API 경로, 포트, 명령과 일치해야 한다.
- mock 데이터를 실제 규격처럼 문서화하지 않아야 한다.
- 비밀값 예시는 placeholder만 사용해야 한다.

### 14. Security / Safety Reviewer

책임:

- 비밀값, 토큰, 비밀번호, 개인정보가 코드/문서/로그에 남지 않았는지 확인한다.
- 외부 입력 검증, CORS, 에러 응답, 원본 payload 노출 범위를 점검한다.
- 운영 영향이 있는 변경을 식별한다.

주요 산출물:

- 보안/안전 점검 체크리스트
- 민감정보 노출 여부
- 운영 영향 리스크
- 차단해야 할 작업 목록

검증 기준:

- 비밀값이 커밋 대상에 없어야 한다.
- 스택 트레이스나 내부 세부 정보가 사용자 응답에 과도하게 노출되지 않아야 한다.
- 실제 장비 제어 또는 배포 영향이 있으면 중단 조건으로 보고해야 한다.

## 협업 프로토콜

### 작업 시작

PM / 오케스트레이터는 먼저 다음을 정리한다.

```text
목표:
허용 범위:
금지 범위:
현재 상태:
완료 기준:
검증 기준:
```

### 에이전트 조사 요청 형식

각 에이전트에게 작업을 줄 때는 아래 형식을 사용한다.

```text
역할:
확인할 범위:
읽을 문서/파일:
산출물:
주의할 점:
```

### 에이전트 응답 형식

각 에이전트는 아래 형식으로 응답한다.

```text
요약:
확인한 파일:
발견 사항:
권장 작업:
리스크:
검증 방법:
미확정/확인 필요:
```

### 구현 루프 형식

```text
1. 현재 목표 선택
2. 관련 문서와 파일 확인
3. 에이전트별 조사 또는 리뷰
4. 구현
5. 검증
6. 실패 시 원인 분석 후 수정
7. 재검증
8. 결과 기록
9. 다음 목표 선택
```

### 무검증 브랜치 push 루프

사용자가 무검증 브랜치 push 모드를 켠 경우 아래 흐름을 사용할 수 있다.

```text
1. 기능 또는 작업 묶음 선택
2. `codex/<기능명>` 브랜치 생성
3. 해당 기능 범위만 구현
4. 검증 생략 여부 기록
5. `git status --short`로 커밋 대상 확인
6. 비밀값/생성물/범위 밖 변경이 없으면 커밋
7. 원격 브랜치로 push
8. 결과 보고에 브랜치, 커밋, push 결과, 미검증 항목 기록
```

무검증 push 모드에서도 비밀값, 배포, 외부 장비 영향, 파괴적 Git 작업은 중단 조건이다.

### 충돌 처리

- 백엔드 API 변경과 프론트 사용 방식이 충돌하면 Tech Lead가 계약을 먼저 정리한다.
- 디자인 개선과 기능 안정성이 충돌하면 기능 안정성을 우선한다.
- Docker 실행 편의와 로컬 개발 편의가 충돌하면 팀 공통 실행 기준을 우선한다.
- 미확정 라이다 규격 때문에 구현이 막히면 raw payload 보존과 adapter 확장성으로 우회하고 `확인 필요`로 남긴다.

## 1차 개발 마일스톤

### M0. 현황 진단

목표:

- 현재 API, 화면, DB, Docker, 테스트 명령을 파악한다.

완료 기준:

- 현재 기능 목록
- 깨진 기능 또는 미완성 기능 목록
- 우선순위 백로그
- 검증 가능한 명령 목록

### M1. 라이다 이벤트 수신 안정화

목표:

- `/api/wrongway` 수신, adapter 변환, raw payload 보존을 정리한다.

완료 기준:

- 정상 payload 수신
- 불완전 payload 처리
- 최근 이벤트 조회
- Swagger/curl 테스트 가능

### M2. 이벤트 저장과 상태 API 정리

목표:

- 이벤트 이력, 최근 이벤트, 수신 상태를 프론트가 안정적으로 사용할 수 있게 한다.

완료 기준:

- API 응답 구조 일관성
- DB 또는 메모리 저장 방식의 한계 명시
- 상태 요약 API 동작

### M3. 관제 대시보드 UI 완성

목표:

- 운영자가 역주행 이벤트, 상태, 로그를 빠르게 확인할 수 있게 한다.

완료 기준:

- 첫 화면 정보 우선순위 정리
- 최근 이벤트와 상세 보기
- 로딩/에러/빈 상태 처리
- 데스크톱/모바일 표시 확인

### M4. 현장 테스트 지원

목표:

- Swagger, curl, Docker 실행 기준으로 현장 연동 테스트가 가능하게 한다.

완료 기준:

- curl 예시 최신화
- Swagger 문서 일치
- 실행 명령 정리
- 미확정 필드와 현장 확인 사항 정리

### M5. 통합 검증과 안정화

목표:

- 프론트, 백엔드, Docker, 문서가 같은 동작을 설명하도록 맞춘다.

완료 기준:

- 가능한 build/lint/test 통과
- API 스모크 테스트 통과
- 주요 회귀 항목 확인
- 남은 리스크와 미검증 항목 보고

무검증 브랜치 push 모드에서는 M5를 생략하고 push할 수 있다. 이 경우 M5 항목 전체를 `미검증`으로 표시한다.

## 완료 정의

1차 개발은 아래 조건을 만족하면 완료로 본다.

- `/api/wrongway`가 라이다 PC 예상 JSON을 수신할 수 있다.
- 원본 payload 확인 경로가 있다.
- 이벤트 목록, 최근 이벤트, 상태 요약이 화면에 표시된다.
- Swagger 또는 curl로 현장 테스트가 가능하다.
- mock과 실제 ingest의 구분이 문서와 코드에서 명확하다.
- 가능한 검증 명령을 실행했고 결과를 보고했다.
- 미확정 라이다 필드와 통합제어보드 프로토콜은 `확인 필요`로 남겼다.
- 비밀값, 실제 배포, 물리 장비 제어가 포함되지 않았다.

## 최종 보고 형식

```text
작업 목표:
수정 파일:
변경 내용:
검증 명령:
검증 결과:
미검증:
브랜치:
커밋:
push 결과:
남은 리스크:
다음 권장 작업:
```

## 에이전틱 기획/개발 대화 프로토콜

기능 개발 전에는 단일 에이전트가 바로 구현하지 않고, PM이 아래 순서로 역할별 의견을 모은 뒤 계약을 확정한다.

1. PM이 기능 목표, 사용자 가치, 금지 범위, 예상 브랜치를 선언한다.
2. UI/UX가 화면 흐름, 관제 우선순위, 상태/오류/빈 화면, 접근성 리스크를 제안한다.
3. Backend/DB가 API 계약, 저장 모델, migration 필요성, WebSocket/polling 계약을 제안한다.
4. Auth/Security가 JWT, 권한, 비밀값, 공개/보호 API, 장비 ingest 인증 경계를 검토한다.
5. LiDAR/Domain이 payload 의미, track/situation lifecycle, 현장 curl 시나리오, 미확정 필드를 검토한다.
6. Hardware/Field Control이 UTP Ethernet 연결, CRC-8, 실제 장비 영향, 브릿지/전송 adapter 검증 순서를 검토한다.
7. Infrastructure/Network가 Nginx reverse proxy, 포트 노출, TLS/WebSocket proxy, 방화벽 경계를 검토한다.
8. Security Assurance가 납품 전 보안 검사, SAST/DAST/dependency/secret/container scan, 보안 헤더/CORS/JWT 점검 범위를 정한다.
9. Delivery/Acceptance가 설치, 검수, 운영 runbook, 증적, 인수인계 기준을 정한다.
10. QA/DevOps가 실행 환경, 검증 명령, Docker/DB 상태, 무검증 push 시 `미검증` 표기 범위를 정한다.
11. Tech Lead가 충돌을 조정하고 구현 순서와 interface freeze 항목을 확정한다.
12. 메인 에이전트가 구현, 검증 또는 무검증 push, 결과 보고를 수행한다.

에이전트 응답은 단순 의견이 아니라 서로에게 넘길 질문을 포함해야 한다.

```text
내 역할의 결론:
다른 에이전트에게 필요한 계약:
구현 전 확정할 interface:
브랜치 제안:
검증 또는 미검증 처리:
막히면 사용할 fallback:
```

## 에이전트 간 필수 협의 매트릭스

| 주제 | 주관 | 반드시 협의할 역할 | 합의 산출물 |
| --- | --- | --- | --- |
| JWT 로그인 | Auth/Security | Backend, Frontend, QA, Docs | `/api/auth/login`, `/api/auth/me`, 토큰 저장/만료/401 처리, Swagger bearer |
| 관제 메인 UI | UI/UX | Frontend, Backend, LiDAR, PM | 첫 화면 정보 우선순위, active incident, health strip, recent ingest |
| 이벤트 저장/조회 | Backend/DB | Frontend, QA, LiDAR | `/api/events`, `/api/events/recent`, pagination/cursor, filters |
| 원본 payload 확인 | LiDAR/Domain | UI/UX, Frontend, Security | raw payload drawer, 복사/접기, 민감값 노출 기준 |
| WebSocket/polling | Backend/DB | Frontend, QA, DevOps | message type, reconnect, `since` 또는 cursor 복구 |
| vehicle track lifecycle | LiDAR/Domain | Backend/DB, UI/UX, PM | `ACTIVE/ENDED/STALE`, level escalation, situation-ended 처리 |
| 장비/구역 상태 | Backend/DB | UI/UX, DevOps, LiDAR | sites/zones/devices API, device health, last seen, latency |
| 통합제어보드 Ethernet/CRC | Hardware/Field Control | Backend, QA, DevOps, Security, Docs | UTP Ethernet 전제, 10바이트 frame, CRC-8 계산 범위, transport/bridge 검증 |
| 통합제어보드 명령 lifecycle | Backend/DB | Hardware, Security, QA, Frontend, PM | dashboard outbound command, board response/status, audit log, retry/timeout |
| 통합제어보드 준비 | Backend/DB | Hardware, Security, LiDAR, PM | 직접 물리 제어 제외, command/status/log boundary |
| Nginx reverse proxy | Infrastructure/Network | Frontend, Backend, DevOps, Security, QA | `/`, `/api`, `/ws`, `/api-docs`, health 경로, TLS/header/proxy timeout |
| 네트워크/방화벽 | Infrastructure/Network | Hardware, DevOps, Security, Delivery | 현장망 포트 노출표, 라이다 PC 접근, 통합제어보드 IP/port, DB 외부 비노출 |
| 보안 검사 | Security Assurance | Backend, Frontend, Infra, QA, Delivery | SAST, dependency audit, secret scan, container scan, DAST, manual checklist |
| 납품/검수 | Delivery/Acceptance | PM, QA, DevOps, Security, Hardware, Docs | 설치 runbook, acceptance checklist, evidence package, known limitations |
| Docker/현장 실행 | DevOps | Backend, Frontend, QA, Docs | `.env.example`, port, compose, Windows/PowerShell 실행 가이드 |
| 릴리즈/브랜치 push | QA/DevOps | PM, Tech Lead, Security | branch, commit, push, skipped checks as `미검증` |

## 최종 기능 백로그

아래 백로그는 현재 라이다 역주행 대시보드 최종 개발 범위의 기준이다. 이미 구현된 항목은 재확인 후 보강하고, 미구현 항목은 기능별 브랜치로 나누어 진행한다.

### A. 인증/JWT

- `POST /api/auth/login`: `userId`, `password`를 받아 JWT access token과 사용자 정보를 반환한다.
- `GET /api/auth/me`: bearer token으로 현재 사용자를 조회한다.
- `POST /api/auth/logout`: v1에서는 클라이언트 토큰 폐기 중심으로 처리한다.
- 사용자 API는 JWT 보호, 라이다 장비 ingest API는 JWT 보호 대상에서 제외한다.
- 장비 ingest 보안은 별도 단계에서 `X-Device-Key`, IP allowlist, network policy로 확장한다.
- 프론트는 로그인 화면, 세션 복구, 401 session expired, 로그아웃, protected route를 제공한다.
- `.env.example`에는 placeholder만 넣고 실제 `JWT_SECRET`, 관리자 비밀번호/해시는 커밋하지 않는다.

권장 브랜치:

- `codex/feature-auth-backend-core`
- `codex/feature-auth-protect-apis`
- `codex/feature-auth-frontend`
- `codex/docs-swagger-auth`

### B. 라이다 payload ingest와 lifecycle

- `/api/wrongway`를 canonical 라이다 PC endpoint로 유지한다.
- 지원 type: `normal-driving`, `wrong-way-level-1`, `wrong-way-level-2`, `situation-ended`.
- `normal-driving`은 `vehicle_tracks` upsert 중심으로 처리하고 이벤트 폭증을 피한다.
- wrong-way level 1/2와 situation-ended는 `traffic_events`, `event_logs`, realtime message로 연결한다.
- `situationId` 또는 `incidentId`로 level escalation과 종료를 같은 상황으로 묶는 모델을 검토한다.
- track lifecycle은 `ACTIVE`, `WARNING_1`, `WARNING_2`, `ENDED`, `STALE` 중 실제 UI/DB에 필요한 최소 상태부터 적용한다.
- `zone_id`는 외부 라이다 code와 DB zone 매핑 실패를 명확히 표시한다.
- 중복 resend, 잘못된 timestamp, warning/type 불일치, raw payload 과대 입력을 방어한다.

권장 브랜치:

- `codex/wrongway-payload-contract`
- `codex/vehicle-track-lifecycle`
- `codex/wrongway-dedupe-policy`
- `codex/wrongway-field-curl-scenarios`

### C. 백엔드 API/DB 계약

- `GET /api/events`: status, eventType, warningLevel, zoneId, trackId, from/to, pagination 또는 cursor를 지원한다.
- `GET /api/events/recent`: WebSocket fallback용 `since` 또는 cursor 기반 증분 조회를 지원한다.
- `GET /api/events/:id`, `PATCH /api/events/:id/status`, `PATCH /api/events/:id/memo`, `GET /api/events/:id/logs`를 정리한다.
- `GET /api/event-logs`: 전체 감사 로그 조회를 추가한다.
- `GET /api/sites`, `GET /api/zones`, `GET /api/devices`, `GET /api/devices/status` read API를 추가한다.
- `GET /api/status`: server, database, ingest, websocket, devices 요약 상태를 제공한다.
- WebSocket message type은 `traffic-event.created`, `traffic-event.updated`, `vehicle-track.updated`, `device-status.updated`를 canonical로 정하고 기존 message는 호환 유지한다.
- 신규 API는 `success/data/message` envelope를 우선하되 기존 `ok/items/event` 응답은 프론트 호환 기간 동안 흡수한다.

권장 브랜치:

- `codex/backend-api-contract-cleanup`
- `codex/backend-sites-zones-devices-api`
- `codex/backend-event-query-and-polling`
- `codex/backend-event-lifecycle-schema`
- `codex/backend-realtime-db-broadcast`
- `codex/backend-status-swagger-qa`

### D. 프론트엔드 관제 UI

- 첫 화면은 landing page가 아니라 실제 관제 화면이어야 한다.
- 상단 health strip에 API, DB, WebSocket, 라이다 ingest, 장비 상태를 표시한다.
- active incident panel은 현재 가장 위험한 상황, level, zone, track, elapsed time, 상태 변경 action을 보여준다.
- incident queue와 recent ingest feed를 분리해 현재 경보와 최근 수신 이벤트가 섞이지 않게 한다.
- 이벤트 로그는 필터, 정렬, pagination, raw payload drawer, event timeline, memo/status edit를 제공한다.
- wrongway log는 track 중심 timeline, level escalation, situation-ended, normal-driving track 상태를 보여준다.
- devices/settings는 mock처럼 보이는 값을 실제 API/미연동/미검증 상태로 구분한다.
- 모든 주요 화면에 loading, empty, error, retry, offline/reconnecting 상태를 넣는다.
- 모바일/태블릿에서는 경보 확인과 최근 이벤트 확인이 깨지지 않아야 한다.
- CCTV, 번호판, 차량 소유자 같은 제공되지 않는 정보를 있는 것처럼 표시하지 않는다.

권장 브랜치:

- `codex/frontend-auth-jwt-ux`
- `codex/frontend-status-health-strip`
- `codex/frontend-event-state-model`
- `codex/frontend-raw-payload-drawer`
- `codex/frontend-dashboard-ops-layout`
- `codex/frontend-devices-settings-real-contract`
- `codex/frontend-responsive-empty-error`

### E. 통합제어보드 준비

- 실제 차단기/전광판/스피커 물리 제어는 구현하지 않는다.
- 통합제어보드와 대시보드는 UTP 케이블 기반 Ethernet 통신을 전제로 한다.
- 현재 코드에는 10바이트 패킷 parser와 CRC-8/SMBUS 검증 로직이 있으므로, 문서/Swagger/테스트 벡터와 일치 여부를 계속 확인한다.
- 후속 구현은 대시보드가 command packet을 생성해 통합제어보드로 송신하고, 통합제어보드의 접수/결과/상태 response packet을 다시 수신하는 lifecycle로 설계한다.
- 물리 연결 전에는 HTTP mock, loopback, bridge 프로그램 또는 transport adapter로 parser/CRC/adapter를 검증한다.
- adapter boundary, command model, response/status model, audit log model을 준비하되 실제 물리 제어 실행은 별도 명시 전까지 막는다.
- `control_commands`, `control_command_logs`, `device_status_logs`는 설계 검토 후 migration한다.
- UI에는 실제 제어처럼 오해될 버튼을 넣지 않고, mock/미연동/준비중 상태를 명확히 표시한다.
- 향후 제어 요청 권한, audit log, timeout/retry, manual override 정책을 문서화한다.
- Hardware/Field Control 에이전트는 UTP 배선, Ethernet 연결 방식, 통합제어보드 IP/port, TCP/UDP/HTTP bridge 여부, timeout/retry/heartbeat, 케이블 길이, 노이즈, 현장 안전 조건을 확인 필요 항목으로 관리한다.

권장 브랜치:

- `codex/backend-device-control-readiness`
- `codex/hardware-rs485-control-board-advisory`
- `codex/frontend-control-board-readiness`
- `codex/docs-control-board-protocol-boundary`

### F. QA/DevOps/문서화

- Windows PowerShell 기준 명령과 `npm.cmd` fallback을 문서화한다.
- Docker Desktop 미실행, DB 미기동, port 충돌, `.env` 누락을 진단하는 preflight를 만든다.
- API smoke script는 health, auth, wrongway 4종 payload, events query, memo/status, logs를 확인한다.
- 프론트 smoke는 login, dashboard, event log, raw payload drawer, reconnect/error 상태를 확인한다.
- Swagger는 실제 route와 request/response schema에 맞춘다.
- 무검증 브랜치 push 모드에서는 실행하지 못한 검증을 PR/최종 보고에 `미검증`으로 적는다.

권장 브랜치:

- `codex/qa-local-smoke-scripts`
- `codex/devops-windows-preflight`
- `codex/docker-runtime-stability`
- `codex/docs-field-runbook`

### G. Nginx/운영 인프라

- 납품/운영 환경에서는 Nginx reverse proxy를 중간 진입점으로 두는 구성을 검토한다.
- Nginx는 프론트 정적 파일, `/api` 백엔드 프록시, WebSocket upgrade, Swagger 접근 정책, health endpoint 라우팅을 담당할 수 있다.
- TLS termination, security headers, request body size, proxy timeout, rate limit, access/error log, client IP forwarding을 설계한다.
- DB, 내부 API, 통합제어보드 bridge/adapter는 필요한 경우를 제외하고 외부망에 직접 노출하지 않는다.
- Docker Compose 개발 구성과 Nginx 운영 구성을 분리하고, 현장망 IP/도메인/인증서는 placeholder로만 문서화한다.
- Nginx 설정은 `nginx -t` 또는 컨테이너 config test로 검증 가능한 형태로 둔다.

권장 브랜치:

- `codex/infra-nginx-reverse-proxy`
- `codex/infra-network-firewall-runbook`
- `codex/infra-websocket-proxy-hardening`
- `codex/docs-nginx-delivery-topology`

### H. 납품 보안 검사/검수

- 납품 전에는 자동 검사와 수동 점검을 함께 수행한다.
- 권장 자동 검사 범위: dependency audit, secret scan, lint/build, container image scan, SAST 후보, DAST 후보, Swagger/API smoke.
- DAST는 OWASP ZAP Baseline 같은 passive 중심 검사를 test/staging 환경에서 먼저 수행하고, 실제 장비나 물리 제어 endpoint에 영향을 주지 않도록 scope를 제한한다.
- 수동 점검 범위: JWT 만료/401/권한, 비밀번호 hash, CORS, security headers, Swagger 노출, raw payload 노출, 로그 민감값, Nginx proxy header, rate limit, error page.
- 검사 결과는 `차단`, `납품 전 수정`, `위험 수용`, `미검증`으로 분류한다.
- 납품 검수에는 설치 절차, 계정 초기화, 라이다 POST, 이벤트 조회, Nginx 경유 접속, 장애 재시작, 로그 수집, 백업/복구, 알려진 제한사항을 포함한다.

권장 브랜치:

- `codex/security-delivery-scan-plan`
- `codex/security-headers-cors-jwt-hardening`
- `codex/security-zap-baseline-smoke`
- `codex/delivery-acceptance-runbook`

## 최종 개발 마일스톤

### M0. 현재 상태 진단

- 코드/DB/API/UI/Docker 현황을 읽고 구현됨, 미구현, 불확실 항목을 분리한다.
- 산출물: 현황표, 위험 목록, 첫 브랜치 후보.

### M1. 인증 기반 운영 골격

- JWT backend, frontend login, protected route, Swagger bearer를 연결한다.
- 완료 기준: 로그인 후 대시보드 접근, 만료/401 처리, 공개 ingest API 유지.

### M2. 라이다 ingest와 이벤트 저장 계약 안정화

- `/api/wrongway`, raw payload, vehicle track, traffic event, event log, validation, dedupe를 정리한다.
- 완료 기준: 4종 payload curl 시나리오와 DB 저장/조회 경로.

### M3. 관제 대시보드 UI 고도화

- health strip, active incident, incident queue, recent ingest, raw payload drawer, event timeline을 구현한다.
- 완료 기준: 운영자가 첫 화면에서 현재 위험, 수신 상태, 최근 이벤트를 즉시 파악한다.

### M4. 상태/장비/API 확장

- sites/zones/devices/status, system status, WebSocket canonical messages, polling fallback을 정리한다.
- 완료 기준: 프론트가 mock이 아니라 API/미연동/미검증 상태를 구분해 표시한다.

### M5. 현장 테스트/문서/QA 자동화

- curl, Swagger, smoke script, Docker/PowerShell runbook을 정리한다.
- 완료 기준: 다른 PC에서 clone 후 `.env` 작성만으로 재현 가능한 실행 절차가 있다.

### M6. 통합제어보드 Ethernet/readiness

- 물리 제어 없이 Ethernet packet/CRC 진단, command/status/log 모델과 UI placeholder를 준비한다.
- 완료 기준: 대시보드 outbound command packet, 통합제어보드 response/status packet, 10바이트 frame, CRC-8 계산 범위, mock/serial test 경로, 실제 제어 차단 조건이 문서와 코드에서 일치한다.

### M7. 릴리즈 후보 정리

- lint/build/test/API smoke/Docker 가능 범위를 검증하고, 불가 항목은 `미검증`으로 남긴다.
- 완료 기준: 브랜치/커밋/push/PR 또는 최종 보고에 남은 리스크가 명확하다.

### M8. Nginx/보안/납품 준비

- Nginx reverse proxy, 보안 검사, 납품 검수, 운영 runbook을 정리한다.
- 완료 기준: 프록시 경로, 포트 노출, 보안 검사 결과, acceptance checklist, 증적 패키지, 미검증 항목이 명확하다.

## 오토모드 브랜치 운영 계획

- 기능 브랜치는 `codex/<area>-<feature>` 형식을 기본으로 한다.
- 한 브랜치는 하나의 기능 계약에 집중한다.
- 선행 계약이 필요한 경우 `docs/*` 또는 `*-contract` 브랜치를 먼저 만든다.
- 무검증 push가 요청된 상태에서는 브랜치 push까지 진행할 수 있으나, 실행하지 않은 검증은 `미검증`으로 기록한다.
- 브랜치 간 충돌이 예상되면 PM/Tech Lead가 순서를 재조정한다.
- force push, history rewrite, 비밀값 커밋, 실제 배포, 실제 장비 제어는 중단 조건이다.

권장 순서:

1. `codex/feature-auth-backend-core`
2. `codex/feature-auth-frontend`
3. `codex/backend-api-contract-cleanup`
4. `codex/wrongway-payload-contract`
5. `codex/backend-event-query-and-polling`
6. `codex/frontend-dashboard-ops-layout`
7. `codex/frontend-raw-payload-drawer`
8. `codex/backend-sites-zones-devices-api`
9. `codex/frontend-status-health-strip`
10. `codex/qa-local-smoke-scripts`
11. `codex/docs-field-runbook`
12. `codex/backend-device-control-readiness`
13. `codex/hardware-rs485-control-board-advisory`
14. `codex/infra-nginx-reverse-proxy`
15. `codex/security-delivery-scan-plan`
16. `codex/delivery-acceptance-runbook`

## 현재 핵심 쟁점

- `situation-ended`를 독립 이벤트로 저장할지, 기존 incident 종료 처리로 우선할지 결정이 필요하다.
- `success/data/message` envelope 전환은 기존 프론트 호환을 깨지 않게 점진 적용해야 한다.
- WebSocket fallback은 `since` 기반이 단순하지만 중복 처리 정책이 필요하고, cursor 기반은 안정적이나 구현량이 증가한다.
- 라이다 PC ingest API는 JWT 보호 대상이 아니므로, 별도 장비 인증/네트워크 제한을 후속 보안 과제로 둔다.
- `normal_moving_vehicle_count`는 라이다 제공값인지 DB 집계 KPI인지 UI에서 출처를 분리해야 한다.
- 통합제어보드는 Ethernet/CRC 진단과 audit 가능한 command boundary를 먼저 만들고, 실제 물리 제어 실행은 별도 안전 조건 전까지 막는다.
- UTP 기반 Ethernet 현장 조건은 배선, IP/port, transport 방식, timeout/retry/heartbeat까지 Hardware/Field Control 에이전트 자문을 받는다.
- Nginx를 도입하면 `/api`, WebSocket, Swagger, health, static asset 경로가 모두 프록시 뒤에서 깨지지 않는지 확인해야 한다.
- 납품 보안 검사는 자동 도구 결과와 수동 점검을 모두 남겨야 하며, 실제 장비 영향 가능성이 있는 active scan은 별도 승인 전까지 금지한다.
