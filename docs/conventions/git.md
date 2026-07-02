# Git 컨벤션

이 문서는 라이다 역주행 대시보드 프로젝트의 Git 작업 기준을 정의합니다.

## 기본 원칙

- 하나의 브랜치는 하나의 목적을 가집니다.
- 관련 없는 수정은 같은 커밋에 넣지 않습니다.
- 자동 포맷, 대규모 리팩토링, 기능 변경은 가능하면 분리합니다.
- 민감정보가 포함된 `.env`, token, password, key 파일은 커밋하지 않습니다.
- 생성물, 빌드 결과물, `node_modules`는 커밋하지 않습니다.

## Codex 무검증 브랜치 push 모드

사용자가 명시적으로 무검증 브랜치 push 모드를 요청한 경우 Codex는 기능별 브랜치를 만들고, 변경사항을 커밋하고, 원격 저장소에 push할 수 있습니다.

규칙:

- 기능 또는 작업 묶음마다 별도 브랜치를 사용합니다.
- Codex가 만드는 브랜치는 기본적으로 `codex/` 접두사를 사용합니다.
- 검증을 실행하지 않고 push할 수 있지만, 커밋/PR 설명과 결과 보고에 `미검증`을 명확히 적습니다.
- 검증을 생략한 이유는 `사용자 요청에 따른 무검증 push`로 기록합니다.
- push 전에는 `git status --short`로 커밋 대상에 `.env`, 비밀값, 생성물, `node_modules`가 포함되지 않았는지 확인합니다.
- force push, history rewrite, `git reset --hard`, 대량 삭제, 운영 배포는 무검증 push 모드에 포함하지 않습니다.
- 이미 원격에 같은 브랜치가 있으면 일반 push를 우선하고, 충돌이 나면 멈추고 보고합니다.

## 브랜치 네이밍

형식:

```text
type/short-description
codex/type-short-description
```

예:

```text
feature/auth-login
feature/user-management
feature/dashboard-ui
feature/mock-lidar-events
fix/swagger-docs
docs/conventions
refactor/server-domains
codex/wrongway-ingest-api
codex/frontend-event-api
```

권장 type:

- `feature`: 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 동작 변경 없는 구조 개선
- `chore`: 설정, 빌드, 도구 변경
- `test`: 테스트 추가/수정

## 커밋 메시지

형식:

```text
type: 변경 요약
```

예:

```text
feat: 로그인 API 추가
feat: 사용자 목록 화면 추가
fix: 이벤트 상태 변경 응답 오류 수정
docs: 프론트엔드 컨벤션 추가
refactor: 이벤트 라우터 분리
chore: docker 환경 변수 예시 정리
```

규칙:

- 요약은 한 줄로 작성합니다.
- `type`은 영어로 작성하고, 변경 설명은 한글로 작성할 수 있습니다.
- 무엇을 바꿨는지 명확히 적습니다.
- 여러 기능이 섞이면 커밋을 나눕니다.
- 테스트하지 않았다면 PR 설명에 `미검증`이라고 적습니다.

예:

```text
docs: AI 작업 문서 라우팅 정리
feat: 로그인 API 추가
refactor: 프론트 디렉터리 구조 정리
fix: CI 검증 스크립트 경로 수정
```

## PR 기준

PR에는 아래 내용을 포함합니다.

```text
## 변경 내용
- 

## 검증
- 실행한 명령:
- 결과:
- 미검증 항목:

## 영향 범위
- 

## 참고/주의
- 
```

## 검증 예시

무검증 브랜치 push 모드에서는 아래 검증을 생략할 수 있습니다. 생략한 경우 PR 설명의 검증 항목에 `미검증 - 사용자 요청에 따른 무검증 push`라고 적습니다.

CI 검증:

```text
npm run ci
```

실제 실행:

```text
npm run build:web && npm run check:server
```

의미:

- 프론트 서버를 켜는 명령이 아니라 production build를 확인합니다.
- 백엔드 서버를 켜는 명령이 아니라 JS 문법 검사를 수행합니다.

서버 실행 확인:

```text
프론트: npm --prefix dashboard/dashboard-web run dev
백엔드: npm --prefix dashboard/server start
```

기타 검증:

```text
프론트 lint: npm --prefix dashboard/dashboard-web run lint
Docker 변경: docker compose up --build
```

실행하지 못한 검증은 이유를 적습니다.

## 리뷰 기준

리뷰 때 우선 확인할 것:

- 기존 기능을 깨뜨리는 변경인지
- API 응답 구조가 프론트와 맞는지
- Swagger 문서가 변경과 일치하는지
- Prisma schema와 migration 영향이 명확한지
- mock 데이터가 실제 데이터처럼 오해될 소지가 없는지
- 민감정보가 코드나 로그에 남지 않았는지

## 충돌 처리

- 충돌 파일을 무리하게 덮어쓰지 않습니다.
- 본인이 만든 변경과 다른 사람 변경을 구분합니다.
- 원인 파악 없이 `git reset --hard`를 사용하지 않습니다.
- lock 파일 변경은 의존성 변경 여부를 함께 확인합니다.

## 금지 사항

- `.env` 실제 파일 커밋 금지
- 비밀번호, API key, token 커밋 금지
- 임시 디버그 로그 커밋 금지
- 요청받지 않은 대규모 리팩토링 금지
- 실제 라이다 규격이 아닌 mock 데이터를 실제 규격처럼 문서화 금지
