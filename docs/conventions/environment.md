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
