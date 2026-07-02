# AI 하네스 엔지니어링 가이드

이 문서는 개발자들이 AI를 부담 없이 활용하기 위한 짧은 안내서입니다.

여기서 하네스는 ML 학습 하네스가 아니라 AI와 작업할 때 작업 맥락을 정리하고 결과를 확인하는 공통 습관을 의미합니다.

## 기본 원칙

- 실제 작업 규칙은 `AGENTS.md`가 안내하는 문서를 따릅니다.
- AI에게 맡길 작업의 목적, 범위, 기대 결과를 짧게 정리합니다.
- 확정되지 않은 라이다 데이터 규격, API, DB 구조는 확정된 것처럼 다루지 않습니다.
- 코드 변경, 설정 변경, DB 변경은 영향 범위를 먼저 확인합니다.
- 중간 승인 없이 맡기려면 오토모드라고 명시하고 목표, 허용 범위, 금지 범위, 검증 기준을 함께 적습니다.
- 검증하지 못한 내용은 `미검증`으로 남깁니다.

## 있으면 좋은 정보

AI에게 작업을 맡길 때 아래 정보가 있으면 결과가 더 안정적입니다. 모두 필수는 아닙니다.

```text
작업 목적:
관련 화면 또는 API:
참고하면 좋은 파일:
건드리지 말아야 할 범위:
기대하는 동작:
확인하면 좋은 검증 방법:
```

예:

```text
대시보드 이벤트 리스트를 정리하려고 함.
관련 파일은 DashboardPage와 dashboard.css로 보임.
API 구조는 바꾸지 말고, 밝은 톤으로 가독성만 개선.
가능하면 build까지 확인.
```

오토모드 예:

```text
오토모드로 진행.
목표: 라이다 역주행 대시보드 1차 개발 범위를 끝까지 구현.
허용 범위: dashboard/dashboard-web, dashboard/server, 관련 docs.
금지 범위: 실제 배포, 비밀값 작성, 통합제어보드 물리 제어 구현.
검증 기준: 가능한 build/lint/test/curl 검증을 반복하고 실패 시 직접 수정.
```

## 작업 문서 선택

- 라이다/대시보드/통합제어보드 작업은 `docs/ai/project-context.md`를 먼저 확인합니다.
- 라이다 payload와 제어보드 연동 규격은 `docs/specs/` 아래 문서를 참고합니다.
- 프론트 작업은 `docs/ai/frontend.md`를 참고합니다.
- 백엔드/API/Swagger 작업은 `docs/ai/backend.md`를 참고합니다.
- 구현 원칙은 `docs/ai/implementation.md`를 참고합니다.
- 검증 기준은 `docs/ai/lint-test.md`를 참고합니다.
- 테스트, 빌드, CI 실패 대응은 `docs/ai/testing-feedback-loop.md`를 참고합니다.
- 프로젝트 특이사항은 `docs/ai/project-notes.md`를 참고합니다.

## 컨벤션 문서

- 프로젝트 구조는 `docs/conventions/project-structure.md`를 참고합니다.
- 프론트엔드 컨벤션은 `docs/conventions/frontend.md`를 참고합니다.
- 백엔드 컨벤션은 `docs/conventions/backend.md`를 참고합니다.
- Git 컨벤션은 `docs/conventions/git.md`를 참고합니다.
- 환경 설정은 `docs/conventions/environment.md`를 참고합니다.

## 결과 확인

AI 작업 결과를 받을 때는 아래 정도만 확인하면 충분합니다.

```text
수정 파일:
변경 내용:
검증 여부:
미검증 또는 주의할 점:
```

특히 실패한 검증, 실행하지 못한 테스트, 추측으로 작성한 내용이 숨겨지지 않았는지 확인합니다.
