# Lidar Dashboard

라이다 기반 역주행 감지 관제 대시보드 프로젝트입니다.

## 프로젝트 구조

```txt
dashboard/
  dashboard-web/   # React/Vite 프론트엔드
  server/          # Node.js 백엔드 API 서버
  demo-server/     # Python 데모/AI 감지 서버
```

## 환경변수

환경변수는 프로젝트 루트의 `.env` 하나만 사용합니다.

```txt
.env
.env.example
```

서버 전용 `.env`, 프론트 전용 `.env`는 사용하지 않습니다.

`.env.example`은 변수 목록과 형식 참고용입니다. 실제 `.env` 파일은 팀 내부 공유값 또는 본인 로컬 설정에 맞게 작성합니다. `.env`는 Git에 올리지 않습니다.

필수 확인값:

```env
POSTGRES_DB=lidar_dashboard_db
POSTGRES_USER=lidar_dashboard_user
POSTGRES_PASSWORD=본인_로컬_DB_비밀번호
POSTGRES_PORT=5433
DATABASE_URL=postgresql://lidar_dashboard_user:본인_로컬_DB_비밀번호@localhost:5433/lidar_dashboard_db?schema=public
```

주의:

- `POSTGRES_PASSWORD`와 `DATABASE_URL` 안의 비밀번호는 반드시 같아야 합니다.
- 로컬 PC에서 Prisma CLI로 DB에 접속할 때는 `localhost:5433`을 사용합니다.
- Docker 컨테이너 내부에서 백엔드가 DB에 접속할 때는 `lidar-dashboard-db-postgres:5432`를 사용합니다.
- 프론트엔드는 `dashboard/dashboard-web/vite.config.js`의 `envDir: "../.."` 설정으로 루트 `.env`를 읽습니다.

## Docker 실행

팀 공통 개발 실행은 Docker Compose 기준입니다.

프로젝트 루트에서 실행합니다.

```bash
docker compose up --build
```

기본 실행 서비스:

- PostgreSQL DB
- 백엔드 서버
- 프론트엔드 서버

기본 실행에서 제외되는 서비스:

- `demo-server`

데모 서버까지 Docker로 함께 실행해야 할 때만 profile을 사용합니다.

```bash
docker compose --profile demo-docker up --build
```

## 자동 DB 적용

백엔드 컨테이너는 시작 시 아래 순서로 자동 실행됩니다.

```bash
npx prisma migrate deploy
npx prisma db seed
npm start
```

따라서 새로 pull 받은 개발자는 보통 아래 명령만 실행하면 됩니다.

```bash
docker compose up --build
```

DB volume을 완전히 초기화해야 할 때:

```bash
docker compose down -v
docker compose up --build
```

주의:

- `docker compose down -v`는 PostgreSQL 데이터까지 삭제합니다.
- 개발 DB 초기화가 필요할 때만 사용합니다.

## 접속 주소

프론트:

```txt
http://localhost:5173
```

백엔드 DB health:

```txt
http://localhost:5000/api/database/health
```

Swagger:

```txt
http://localhost:5000/api-docs
```

라이다 PC 공식 수신 API:

```txt
POST http://localhost:5000/api/wrongway
```

최근 이벤트 API:

```txt
GET http://localhost:5000/api/events/recent?limit=10
GET http://localhost:5000/api/events/summary
```

curl 확인:

```bash
curl http://localhost:5000/api/database/health
```

라이다 수신 테스트:

```bash
curl -X POST http://localhost:5000/api/wrongway \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"wrong-way-level-1\",\"warning_level\":1,\"timestamp\":\"2026-01-13T14:43:54.360258+09:00\",\"confidence\":0.95,\"zone_id\":\"Z327\",\"track_id\":\"81760000-0000-0000-0000-000000000000\",\"message\":\"역주행 1차 감지\",\"speed_ms\":2.83,\"speed_kmh\":10.2,\"object_class\":6,\"uuid\":\"81760000\",\"description\":\"Wrong-way driving detected\",\"consecutive_count\":3,\"is_confirmed\":true,\"normal_moving_vehicle_count\":2}"
```

정상 응답 예시:

```json
{
  "ok": true,
  "database": "postgresql",
  "tables": {
    "users": 0,
    "sites": 1,
    "zones": 2,
    "devices": 4,
    "vehicleTracks": 0,
    "trafficEvents": 0,
    "eventLogs": 0
  }
}
```

## 컨테이너 관리

백그라운드 실행:

```bash
docker compose up --build -d
```

상태 확인:

```bash
docker compose ps
```

로그 확인:

```bash
docker compose logs -f
```

종료:

```bash
docker compose down
```

DB 데이터까지 삭제:

```bash
docker compose down -v
```

## 로컬 실행

Docker가 아니라 로컬에서 직접 실행할 수도 있습니다.

의존성 설치:

```bash
npm install
npm --prefix dashboard/server install
npm --prefix dashboard/dashboard-web install
```

DB 컨테이너만 실행:

```bash
docker compose up -d lidar-dashboard-db-postgres
```

Prisma 적용:

```bash
npm run db:deploy
npm run db:seed
npm run db:status
```

백엔드 실행:

```bash
npm --prefix dashboard/server start
```

프론트 실행:

```bash
npm --prefix dashboard/dashboard-web run dev
```

## 검증

전체 검증:

```bash
npm run ci
```

현재 `ci`는 프론트 빌드와 서버 문법 검사를 실행합니다.

```bash
npm run build:web
npm run check:server
```

## 자주 나는 오류

### DB 인증 실패

```txt
P1000: Authentication failed
```

확인할 것:

- `POSTGRES_PASSWORD`와 `DATABASE_URL` 안의 비밀번호가 같은지
- `DATABASE_URL`이 `localhost:5433/lidar_dashboard_db`를 보고 있는지
- DB 계정/비밀번호를 바꾼 뒤 기존 volume을 초기화했는지

개발 DB 초기화:

```bash
docker compose down -v
docker compose up --build
```

### 5000번 포트 사용 중

```txt
EADDRINUSE: address already in use 0.0.0.0:5000
```

의미:

- 백엔드 서버가 이미 실행 중이거나
- 다른 프로세스가 5000번 포트를 사용 중입니다.

확인:

```bash
netstat -ano | findstr :5000
```

종료:

```bash
taskkill //PID PID번호 //F
```

### npm ci 실패

```txt
package.json and package-lock.json are not in sync
```

의미:

- `package.json`에 의존성이 추가됐지만 `package-lock.json`이 갱신되지 않은 상태입니다.

백엔드 의존성 문제:

```bash
npm --prefix dashboard/server install
```

프론트 의존성 문제:

```bash
npm --prefix dashboard/dashboard-web install
```

### Prisma Client 누락

```txt
Cannot find module '.prisma/client/default'
```

의미:

- Docker 이미지 안에서 Prisma Client가 생성되지 않은 상태입니다.

현재 백엔드 Dockerfile에서는 빌드 중 아래 명령을 실행하도록 되어 있습니다.

```bash
npx prisma generate
```

## package.json 역할

루트 `package.json`:

- 전체 프로젝트 실행/검증 명령 관리
- 예: `npm run ci`, `npm run db:deploy`

`dashboard/server/package.json`:

- 백엔드 의존성 관리
- 예: Express, Prisma, PostgreSQL, Swagger

`dashboard/dashboard-web/package.json`:

- 프론트엔드 의존성 관리
- 예: React, Vite

Docker 빌드는 각 서비스 폴더의 `package.json`, `package-lock.json`을 기준으로 실행됩니다.
