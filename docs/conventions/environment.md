# 환경/설정 파일 관리 기준

이 문서는 라이다 역주행 대시보드 프로젝트에서 `.env`, `config.json`, Docker 설정 파일을 어떻게 공유하고 관리할지 정리합니다.

## 기본 원칙

- 실제 `.env`, `config.json`은 Git에 올리지 않습니다.
- `.env.example`, `config.example.json`에는 예시값만 작성합니다.
- 내부망 IP, 실제 장비 포트, 시리얼 포트, 토큰, 계정 정보는 외부 공개 금지입니다.
- Dockerfile에는 비밀값이나 현장별 값을 직접 쓰지 않습니다.
- 팀원은 `.env.example`을 복사해 `.env`를 만들고, 본인 PC 또는 현장 값에 맞게 수정합니다.
- Docker Compose 실행값은 루트 `.env`를 기준으로 관리합니다.

## 프로젝트 전체

| 파일 | 공유 범위 | Git 업로드 | 설명 |
| --- | --- | --- | --- |
| `.env` | 팀 내부 | 금지 | 실제 실행값. 내부망 IP, 포트, 장비 설정 포함 가능 |
| `.env.example` | 전체 공유 가능 | 허용 | 팀원이 `.env`를 만들 때 참고하는 예시 파일 |
| `docker-compose.yml` | 전체 공유 가능 | 허용 | `.env` 값을 읽어 컨테이너 환경변수와 포트 매핑 구성 |
| `.dockerignore` | 전체 공유 가능 | 허용 | Docker 빌드 제외 파일 규칙 |
| `AGENTS.md` | 전체 공유 가능 | 허용 | AI 에이전트 작업 규칙 라우터 |
| `docs/ai/*.md` | 전체 공유 가능 | 허용 | AI 개발 규칙 문서 |

루트 `.env` 작성 방법:

1. `.env.example`을 복사해서 `.env`를 만듭니다.
2. 같은 PC에서만 테스트하면 `PUBLIC_HOST`는 기본값을 사용합니다.
3. 팀원 PC나 라이다 PC에서 접속해야 하면 `PUBLIC_HOST`를 대시보드 PC의 내부망 IP로 바꿉니다.
4. Docker Compose 내부 통신용 `COMPOSE_BACKEND_HOST`, `COMPOSE_DETECTOR_HOST`는 보통 수정하지 않습니다.

## 프론트엔드

| 파일 | 공유 범위 | Git 업로드 | 설명 |
| --- | --- | --- | --- |
| `dashboard/dashboard-web/.env` | 팀 내부 | 금지 | 프론트엔드 단독 실행 시 사용하는 실제 환경값 |
| `dashboard/dashboard-web/.env.example` | 전체 공유 가능 | 허용 | 프론트엔드 단독 실행용 예시값 |
| `dashboard/dashboard-web/Dockerfile` | 전체 공유 가능 | 허용 | 프론트엔드 Docker 실행 정의. 비밀값 작성 금지 |
| `dashboard/dashboard-web/.dockerignore` | 전체 공유 가능 | 허용 | 프론트엔드 Docker 빌드 제외 규칙 |

주의사항:

- Vite에서 브라우저로 노출되는 값은 `VITE_` prefix가 필요합니다.
- Docker Compose에서는 `PUBLIC_HOST`, `DASHBOARD_PORT`, `DETECTOR_PORT`, `NGINX_PORT`를 조합해 `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_DETECTOR_BASE_URL`을 자동 주입합니다.
- Nginx를 브라우저 진입점으로 사용할 때 WebSocket은 `/ws` 경로를 사용합니다.
- 프론트엔드 코드에 내부망 IP나 URL을 직접 하드코딩하지 않습니다.

## 백엔드

| 파일 | 공유 범위 | Git 업로드 | 설명 |
| --- | --- | --- | --- |
| `dashboard/server/.env` | 팀 내부 | 금지 | 백엔드 단독 실행 시 사용하는 실제 환경값 |
| `dashboard/server/.env.example` | 전체 공유 가능 | 허용 | 백엔드 단독 실행용 예시값 |
| `dashboard/server/config.json` | 팀 내부 | 금지 | 실제 장비 IP, 시리얼 포트, 운영 설정 포함 가능 |
| `dashboard/server/config.example.json` | 전체 공유 가능 | 허용 | 백엔드/데모 서버 설정 예시 |
| `dashboard/server/Dockerfile` | 전체 공유 가능 | 허용 | 백엔드 Docker 실행 정의. 비밀값 작성 금지 |
| `dashboard/server/.dockerignore` | 전체 공유 가능 | 허용 | 백엔드 Docker 빌드 제외 규칙 |

주의사항:

- Docker Compose에서는 백엔드가 데모 서버를 직접 실행하지 않습니다.
- 백엔드는 이미 떠 있는 데모 서버에 HTTP 요청만 전달합니다.
- 실제 운영 또는 현장 설정이 들어간 `config.json`은 Git에 올리지 않습니다.
- `config.example.json`에는 예시값만 유지합니다.

## 현장 납품 환경 키

실제 현장값은 루트 `.env`에만 작성합니다. 아래 키는 `.env.example`과 자동 산출물에서 안내하지만, 실제 IP, 포트, 토큰, 비밀번호, 승인 여부는 Git에 올리지 않습니다.

| 키 | 담당 | 관리 기준 |
| --- | --- | --- |
| `FIELD_BASE_URL` | Field Operations | Nginx 또는 운영자 UI 진입 URL입니다. 로컬 검토는 `http://localhost:8080`을 사용할 수 있지만, 납품 검수는 현장 URL로 바꿉니다. |
| `CONTROL_BOARD_HOST` | Control-board TCP | 통합제어보드의 현장 내부망 IP 또는 host입니다. 장비 담당자 확인 전에는 비워 둡니다. |
| `CONTROL_BOARD_PORT` | Control-board TCP | 통합제어보드 TCP 포트입니다. 실제 포트는 현장 연동 때만 `.env`에 적습니다. |
| `CONTROL_BOARD_DRY_RUN` | Control-board TCP | 실제 장비 승인 전에는 `true`를 유지합니다. |
| `CONTROL_BOARD_LIVE_APPROVED` | Control-board TCP + PM | 실제 TCP 명령 시험 승인과 ACK 증거가 준비된 경우에만 `true`로 바꿉니다. |
| `DEVICE_INGEST_API_KEY` | LiDAR Ingest + Auth/Security | 라이다 PC 또는 브리지의 `X-Device-Key` 공유 키입니다. 실제 값은 증거 문서에 붙이지 않습니다. |
| `JWT_SECRET` | Auth/Security | 운영 JWT 서명 비밀값입니다. `.env.example`의 예시값을 그대로 쓰지 않습니다. |
| `SEED_ADMIN_PASSWORD` | Auth/Security | 초기 관리자 비밀번호입니다. 현장 세팅 후 교체 또는 회수 절차를 남깁니다. |
| `CORS_ORIGINS` | Auth/Security | 운영자 UI origin만 쉼표로 나열합니다. 와일드카드나 불필요한 origin은 금지합니다. |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` | Auth/Security | HTTPS/TLS와 배포 토폴로지에 맞춰 설정합니다. `SameSite=None`은 Secure 쿠키가 필요합니다. |
| `NGINX_SWAGGER_ALLOW` | Nginx Delivery | Swagger 접근 허용 CIDR입니다. 납품 환경에서 `all`로 열어 두지 않습니다. |
| `NGINX_CONTENT_SECURITY_POLICY` | Nginx Delivery + Auth/Security | 운영자 UI, API, WebSocket, 미디어 경로를 검토한 뒤 승인된 CSP만 사용합니다. |
| `NGINX_WRONGWAY_RATE_LIMIT` / `NGINX_WRONGWAY_BURST` | Nginx Delivery | 라이다 PC 이벤트 전송량과 버스트 프로파일을 확인한 뒤 정합니다. |

현장값 정리는 `npm run field:env-closeout`, `npm run field:closeout-quickstart`, `npm run final:gate-classification` 산출물을 함께 보고 진행합니다. 키별 소유자와 제안값은 `dashboard/server/scripts/field-env-catalog.js`에서 공통 관리합니다.

## 데모 서버

| 파일 | 공유 범위 | Git 업로드 | 설명 |
| --- | --- | --- | --- |
| `dashboard/demo-server/.env` | 팀 내부 | 금지 | 데모 서버 단독 실행값이 생길 경우 실제 환경값으로 취급 |
| `dashboard/demo-server/config.json` | 팀 내부 | 금지 | 실제 라이다/시리얼/영상 소스 설정 포함 가능 |
| `dashboard/demo-server/config.docker.json` | 전체 공유 가능 | 허용 | Docker 개발용 기본 설정. 현재는 비밀값 없음 |
| `dashboard/demo-server/requirements.txt` | 전체 공유 가능 | 허용 | 로컬 venv용 Python 패키지 목록 |
| `dashboard/demo-server/requirements.docker.txt` | 전체 공유 가능 | 허용 | Docker용 Python 패키지 목록 |
| `dashboard/demo-server/Dockerfile` | 전체 공유 가능 | 허용 | 데모 서버 Docker 실행 정의. 비밀값 작성 금지 |

주의사항:

- `config.docker.json`은 Docker 개발용 기본값이므로 현재는 Git 업로드 가능합니다.
- 나중에 실제 내부망 IP, 실제 시리얼 포트, 현장 장비 정보가 들어가면 Git 업로드 금지 대상으로 바꿔야 합니다.
- 데모 서버 코드는 환경변수가 있으면 `config.json`보다 환경변수를 우선 사용합니다.
- Docker Compose에서는 루트 `.env` 값이 데모 서버 컨테이너로 주입됩니다.

## Git 업로드 금지 권장 목록

`.gitignore`에는 최소한 아래 항목이 포함되어야 합니다.

```text
.env
*.local

dashboard/dashboard-web/.env
dashboard/server/.env
dashboard/server/config.json

dashboard/demo-server/.env
dashboard/demo-server/config.json
```

## 실행 흐름

```bash
copy .env.example .env
```

이후 `.env`에서 본인 PC 또는 현장 환경에 맞게 값을 수정합니다.

```bash
docker compose up --build
```

백그라운드 실행:

```bash
docker compose up --build -d
```

종료:

```bash
docker compose down
```

## 판단 기준 요약

| 질문 | 판단 |
| --- | --- |
| 실제 실행값인가? | Git 업로드 금지 |
| 내부망 IP나 장비 포트가 들어가는가? | Git 업로드 금지 |
| 토큰, 계정, 비밀번호가 들어가는가? | Git 업로드 금지 |
| 팀원이 참고할 예시값인가? | `.example` 파일로 Git 업로드 가능 |
| Docker 실행 구조 자체인가? | Git 업로드 가능 |
| 현장별 설정이 들어간 Docker config인가? | Git 업로드 금지로 전환 필요 |
