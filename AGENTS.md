# AGENTS.md

이 문서는 AI 에이전트용 라우터입니다. 작업 전 요청 범위에 맞는 문서만 읽고 따릅니다.

## 공통 작업 원칙

- 요청을 먼저 짧게 요약합니다.
- 모르면 모른다고 말하고 질문합니다.
- 확인하지 않은 사실은 단정하지 않습니다.
- 기본 모드는 승인 후 수정이지만, 사용자가 명시적으로 오토모드를 요청하면 초기 목표/범위/금지영역을 승인으로 간주하고 중간 승인 없이 진행합니다.
- 오토모드에서도 파괴적 작업, 비밀값 노출, 배포 실행, 외부 서비스 과금/운영 영향, 범위 밖 대규모 변경은 멈추고 확인합니다.
- 사용자가 무검증 브랜치 push 모드를 명시하면 기능별 브랜치 생성, 커밋, 원격 push까지 중간 승인 없이 진행할 수 있습니다.
- 무검증 브랜치 push 모드에서는 실행하지 않은 빌드/테스트/린트/API 확인을 반드시 `미검증`으로 보고합니다.
- 요청 범위 밖 리팩토링과 추가 기능을 하지 않습니다.
- 검증하지 않은 결과는 `미검증`이라고 보고합니다.

## AI 작업 문서

- 현재 프로젝트 컨텍스트: `docs/ai/project-context.md`
- 현장 시스템 최신 요구사항: `docs/ai/field-system-requirements.md`
- 멀티에이전틱 프로그래밍 컨텍스트 요약: `docs/ai/multi-agent-programming-context-summary.md`
- 피드백/승인: `docs/ai/feedback-loop.md`
- 설계: `docs/ai/design.md`
- 구현: `docs/ai/implementation.md`
- 백엔드: `docs/ai/backend.md`
- 프론트엔드: `docs/ai/frontend.md`
- Docker: `docs/ai/docker.md`
- 린트/테스트: `docs/ai/lint-test.md`
- 테스트 피드백 루프: `docs/ai/testing-feedback-loop.md`
- 프로젝트 메모: `docs/ai/project-notes.md`
- AI 활용 가이드: `docs/ai/harness-engineering.md`
- 멀티에이전트 오토개발: `docs/ai/multi-agent-autodev.md`

## 개발 컨벤션 문서

- 프로젝트 구조: `docs/conventions/project-structure.md`
- 프론트엔드 컨벤션: `docs/conventions/frontend.md`
- 백엔드 컨벤션: `docs/conventions/backend.md`
- Git 컨벤션: `docs/conventions/git.md`
- 환경 설정 컨벤션: `docs/conventions/environment.md`

## 연동 규격 문서

- 라이다 PC-대시보드 payload 규격: `docs/specs/lidar-dashboard-payload.md`
- 대시보드-통합제어보드 프로토콜 정의: `docs/specs/dashboard-control-board-protocol.md`

## 현재 프로젝트 전제

- 프론트엔드: `dashboard/dashboard-web`
- 백엔드: `dashboard/server`
- 데모/AI 감지 서버: `dashboard/demo-server`
- Docker 실행 기준: `docker-compose.yml`
- 라이다 PC 데이터 규격은 아직 확정되지 않았으므로 실제 연동부는 mock/adapter 구조로 분리합니다.
