# Git 컨벤션

이 문서는 라이다 역주행 대시보드 프로젝트의 Git 작업 기준을 정의합니다.

## 현재 운영 방식

- 기본 브랜치는 `dev`입니다.
- Codex 작업은 별도 지시가 없는 한 `dev`에서 직접 커밋하고 `origin/dev`로 바로 push합니다.
- PR은 만들지 않습니다. GitHub PR이 쌓이지 않도록 기능 브랜치도 기본적으로 만들지 않습니다.
- 기능 브랜치, draft PR, release branch가 필요한 경우에는 사용자가 명시적으로 요청했을 때만 사용합니다.
- push 전에는 `git status --short`로 커밋 대상에 `.env`, 비밀값, 생성물, `node_modules`, 요청 범위 밖 변경이 포함되지 않았는지 확인합니다.
- force push, history rewrite, `git reset --hard`, 대량 삭제, 운영 배포는 현재 오토모드에 포함하지 않습니다.

## 커밋 단위

- 관련 없는 수정은 같은 커밋에 넣지 않습니다.
- 자동 포맷, 대규모 리팩토링, 기능 변경은 가능하면 분리합니다.
- 민감정보가 포함된 `.env`, token, password, key 파일은 커밋하지 않습니다.
- 생성물, 빌드 결과물, `node_modules`는 커밋하지 않습니다.
- 실행하지 못한 검증은 최종 보고에 `미검증`으로 남깁니다.

## 커밋 메시지

형식:

```text
type: 변경 요약
```

예:

```text
feat: 로그인 API 추가
fix: 이벤트 상태 변경 응답 오류 수정
docs: 프론트엔드 컨벤션 추가
refactor: 이벤트 라우터 분리
chore: docker 환경 변수 예시 정리
test: 제어보드 TCP loopback smoke 추가
```

권장 type:

- `feat`: 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 동작 변경 없는 구조 개선
- `chore`: 설정, 빌드, 도구 변경
- `test`: 테스트 추가/수정

규칙:

- 요약은 한 줄로 작성합니다.
- `type`은 영어로 작성하고, 변경 설명은 한글로 작성할 수 있습니다.
- 무엇을 바꿨는지 명확히 적습니다.
- 여러 기능이 섞이면 커밋을 나눕니다.

## 직접 push 루프

현재 오토모드에서 Codex는 아래 흐름을 기본으로 사용합니다.

```text
1. 작업 묶음 선택
2. dev 최신 상태 확인
3. 필요한 파일만 수정
4. 가능한 검증 실행
5. git status --short로 커밋 대상 확인
6. 비밀값/생성물/범위 밖 변경이 없으면 커밋
7. origin/dev로 push
8. 결과 보고에 커밋, push 결과, 검증/미검증 항목 기록
```

## 검증 예시

CI 검증:

```text
npm run ci
```

Smoke 검증:

```text
npm run smoke
```

실제 실행:

```text
npm run build:web && npm run check:server
```

서버 실행 확인:

```text
프론트: npm --prefix dashboard/dashboard-web run dev
백엔드: npm --prefix dashboard/server start
```

기타 검증:

```text
프론트 lint: npm --prefix dashboard/dashboard-web run lint
Docker 설정: docker compose config --quiet
```

실행하지 못한 검증은 이유와 함께 최종 보고에 적습니다.

## 리뷰 기준

리뷰 또는 자체 점검 시 우선 확인할 것:

- 기존 기능을 깨뜨리는 변경인지
- API 응답 구조가 프론트와 맞는지
- Swagger 문서가 변경과 일치하는지
- Prisma schema와 migration 영향이 명확한지
- mock 데이터가 실제 데이터처럼 오해되지 않는지
- 민감정보가 코드나 로그에 남지 않는지
- 통합제어보드 실제 제어 위험이 없는지

## 충돌 처리

- 충돌 파일은 무리하게 덮어쓰지 않습니다.
- 본인이 만든 변경과 다른 사람 변경을 구분합니다.
- 원인 파악 없이 `git reset --hard`를 사용하지 않습니다.
- lock 파일 변경은 의존성 변경 여부를 함께 확인합니다.

## 금지 사항

- `.env` 실제 파일 커밋 금지
- 비밀번호, API key, token 커밋 금지
- 임시 디버그 로그 커밋 금지
- 요청받지 않은 대규모 리팩토링 금지
- 실제 라이다 규격이 아닌 mock 데이터를 실제 규격처럼 문서화 금지
- 사용자 요청 없는 브랜치 생성 및 PR 생성 금지
