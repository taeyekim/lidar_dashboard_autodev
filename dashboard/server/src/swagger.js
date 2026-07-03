const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Lidar Dashboard API",
    version: "1.0.0",
    description: "라이다 역주행 관제 대시보드 백엔드 API",
  },
  servers: [
    {
      url: "/",
      description: "현재 백엔드 서버",
    },
  ],
  tags: [
    { name: "Auth", description: "Operator JWT authentication" },
    { name: "Health", description: "서버 상태 확인" },
    { name: "Database", description: "DB 연결과 기본 테이블 확인" },
    { name: "Dashboard", description: "대시보드 상태와 로그 조회" },
    { name: "System", description: "서버, DB, 수신, 장비 통합 상태" },
    { name: "Sites", description: "현장, 구역, 장비 기준 정보 조회" },
    { name: "Control", description: "차단기와 전광판 제어" },
    { name: "Wrongway", description: "역주행 감지 이벤트" },
    { name: "Events", description: "저장된 교통 이벤트 조회와 상태 관리" },
    { name: "Statistics", description: "정주행/역주행 운영 통계와 제어 성공률" },
    { name: "External Ingest", description: "라이다 PC와 통합 제어보드 외부 이벤트 수신" },
    { name: "Demo", description: "감지 데모 제어" },
  ],
  paths: {
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Operator login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthLoginRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "JWT login success",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthLoginResponse" },
              },
            },
          },
          401: {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current operator profile",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Authenticated operator",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthMeResponse" },
              },
            },
          },
          401: {
            description: "Invalid or missing token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "백엔드 서버 상태 확인",
        responses: {
          200: {
            description: "서버 실행 중",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/database/health": {
      get: {
        tags: ["Database"],
        summary: "DB 연결 상태 확인",
        description:
          "Prisma가 PostgreSQL에 접속할 수 있는지 확인하고, 기본 테이블별 데이터 수를 반환합니다. 마이그레이션과 seed 적용 여부를 Swagger에서 빠르게 점검하기 위한 API입니다.",
        responses: {
          200: {
            description: "DB 연결 및 기본 테이블 조회 성공",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DatabaseHealthResponse" },
              },
            },
          },
          503: {
            description: "DB 연결 또는 기본 테이블 조회 실패",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DatabaseHealthErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/state": {
      get: {
        tags: ["Dashboard"],
        summary: "현재 대시보드 상태 조회",
        responses: {
          200: {
            description: "메모리에 저장된 현재 대시보드 상태",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DashboardState" },
              },
            },
          },
        },
      },
    },
    "/api/logs": {
      get: {
        tags: ["Dashboard"],
        summary: "최근 대시보드 로그 조회",
        responses: {
          200: {
            description: "최근 로그 목록",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LogItem" },
                },
              },
            },
          },
        },
      },
    },
    "/api/status": {
      get: {
        tags: ["System"],
        summary: "통합 시스템 상태 조회",
        description:
          "서버, DB, 라이다 수신, WebSocket, 장비, 통합제어보드 상태를 한 번에 조회합니다.",
        responses: {
          200: {
            description: "통합 시스템 상태",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SystemStatusResponse" },
              },
            },
          },
        },
      },
    },
    "/api/sites": {
      get: {
        tags: ["Sites"],
        summary: "현장 목록 조회",
        responses: {
          200: {
            description: "현장 목록",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SiteListResponse" },
              },
            },
          },
        },
      },
    },
    "/api/zones": {
      get: {
        tags: ["Sites"],
        summary: "구역 목록 조회",
        parameters: [
          { name: "siteId", in: "query", schema: { type: "string" } },
          { name: "type", in: "query", schema: { type: "string", example: "ROUNDABOUT" } },
        ],
        responses: {
          200: {
            description: "구역 목록",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ZoneListResponse" },
              },
            },
          },
        },
      },
    },
    "/api/devices": {
      get: {
        tags: ["Sites"],
        summary: "장비 목록 조회",
        parameters: [
          { name: "zoneId", in: "query", schema: { type: "string" } },
          { name: "deviceType", in: "query", schema: { type: "string", example: "CONTROL_BOARD" } },
          { name: "status", in: "query", schema: { type: "string", example: "ONLINE" } },
          { name: "healthStatus", in: "query", schema: { type: "string", example: "OK" } },
        ],
        responses: {
          200: {
            description: "장비 목록",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeviceListResponse" },
              },
            },
          },
        },
      },
    },
    "/api/devices/status": {
      get: {
        tags: ["Sites"],
        summary: "장비 상태 요약 조회",
        responses: {
          200: {
            description: "장비 상태 요약",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeviceStatusSummaryResponse" },
              },
            },
          },
        },
      },
    },
    "/api/gate/open": {
      post: {
        tags: ["Control"],
        summary: "차단기 열기",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "차단기 열기 명령 접수",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GateResponse" },
              },
            },
          },
        },
      },
    },
    "/api/gate/close": {
      post: {
        tags: ["Control"],
        summary: "차단기 닫기",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "차단기 닫기 명령 접수",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GateResponse" },
              },
            },
          },
        },
      },
    },
    "/api/vms": {
      post: {
        tags: ["Control"],
        summary: "전광판 문구 전송",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/VmsRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "전광판 문구 접수",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VmsResponse" },
              },
            },
          },
        },
      },
    },
    "/api/control/status": {
      get: {
        tags: ["Control"],
        summary: "제어 상태 조회",
        description:
          "현장 연동 테스트 중 차단기, 전광판, 라이다 표시 상태를 한 번에 확인하기 위한 API입니다. 현재는 DB 없이 메모리 상태를 반환합니다.",
        responses: {
          200: {
            description: "현재 제어 상태",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ControlStatusResponse" },
              },
            },
          },
        },
      },
    },
    "/api/control-board/status": {
      get: {
        tags: ["Control"],
        summary: "Integrated control board TCP status",
        description:
          "Returns the configured control board transport mode, dry-run/live state, command counts, and latest command.",
        responses: {
          200: {
            description: "Control board command channel status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ControlBoardStatusResponse" },
              },
            },
          },
        },
      },
    },
    "/api/control-board/commands": {
      get: {
        tags: ["Control"],
        summary: "List integrated control board command history",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", example: 20 } },
          { name: "status", in: "query", schema: { type: "string", example: "DRY_RUN" } },
          { name: "commandType", in: "query", schema: { type: "string", example: "STAGE_1_ON" } },
          { name: "trafficEventId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Control board command list",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ControlBoardCommandListResponse" },
              },
            },
          },
        },
      },
    },
    "/api/control-board/commands/test": {
      post: {
        tags: ["Control"],
        summary: "Send or dry-run an integrated control board command",
        description:
          "Uses CONTROL_BOARD_DRY_RUN=true by default. Disable dry-run only after CONTROL_BOARD_HOST and CONTROL_BOARD_PORT are set for field testing.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ControlBoardCommandTestRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Control board test command result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ControlBoardCommandTestResponse" },
              },
            },
          },
        },
      },
    },
    "/api/wrongway": {
      post: {
        tags: ["Wrongway"],
        summary: "역주행 감지 이벤트 수신",
        description:
          "라이다 PC 공식 수신 endpoint입니다. DEVICE_INGEST_API_KEY가 설정된 환경에서는 X-Device-Key header가 필요합니다.",
        security: [{ deviceKeyAuth: [] }, {}],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/WrongwayRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "이벤트 수신 및 대시보드 전파 완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WrongwayIngestResponse" },
              },
            },
          },
        },
      },
    },
    "/api/events": {
      get: {
        tags: ["Events"],
        summary: "저장된 이벤트 목록 조회",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", example: 20 } },
          { name: "offset", in: "query", schema: { type: "integer", example: 0 } },
          { name: "status", in: "query", schema: { type: "string", example: "NEW" } },
          { name: "eventType", in: "query", schema: { type: "string", example: "wrong-way-level-1" } },
          { name: "externalZoneId", in: "query", schema: { type: "string", example: "Z327" } },
          { name: "trackId", in: "query", schema: { type: "string", example: "grid_16648_16670" } },
        ],
        responses: {
          200: {
            description: "이벤트 목록",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EventListResponse" },
              },
            },
          },
        },
      },
    },
    "/api/events/recent": {
      get: {
        tags: ["Events"],
        summary: "최근 이벤트 조회",
        responses: {
          200: {
            description: "최근 이벤트 목록",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EventListResponse" },
              },
            },
          },
        },
      },
    },
    "/api/events/summary": {
      get: {
        tags: ["Events"],
        summary: "이벤트 요약 조회",
        responses: {
          200: {
            description: "이벤트 집계 요약",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/EventSummaryResponse" },
              },
            },
          },
        },
      },
    },
    "/api/statistics/traffic": {
      get: {
        tags: ["Statistics"],
        summary: "교통 운영 통계 조회",
        description:
          "vehicle_tracks의 unique track 기준 차량 수, wrong-way 이벤트 기준 역주행 수, 통합 제어보드 명령 성공률을 기간별로 집계합니다.",
        parameters: [
          {
            name: "range",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], default: "daily" },
          },
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "zoneId", in: "query", required: false, schema: { type: "string" } },
          { name: "externalZoneId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "교통 운영 통계",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TrafficStatisticsResponse" },
              },
            },
          },
        },
      },
    },
    "/api/events/{id}": {
      get: {
        tags: ["Events"],
        summary: "이벤트 상세 조회",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "이벤트 상세",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    event: { $ref: "#/components/schemas/TrafficEvent" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/events/{id}/status": {
      patch: {
        tags: ["Events"],
        summary: "이벤트 상태 변경",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "ACKNOWLEDGED" },
                  message: { type: "string", example: "Operator acknowledged" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "상태 변경 결과",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    event: { $ref: "#/components/schemas/TrafficEvent" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/events/{id}/memo": {
      patch: {
        tags: ["Events"],
        summary: "이벤트 메모 추가",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  memo: { type: "string", example: "현장 확인 완료" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "메모 저장 결과",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    log: { $ref: "#/components/schemas/EventLog" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/events/{id}/logs": {
      get: {
        tags: ["Events"],
        summary: "이벤트 로그 조회",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "이벤트 로그 목록",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    eventId: { type: "string" },
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/EventLog" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/ingest/lidar": {
      post: {
        tags: ["External Ingest"],
        summary: "라이다 PC HTTP 이벤트 수신 호환 경로",
        description:
          "공식 현장 수신 endpoint는 /api/wrongway입니다. 이 경로는 기존 ingest/curl 테스트 호환을 위해 유지하며 내부적으로 같은 라이다 수신 service 흐름을 사용합니다. DEVICE_INGEST_API_KEY가 설정된 환경에서는 X-Device-Key header가 필요합니다.",
        security: [{ deviceKeyAuth: [] }, {}],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LidarIngestRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "라이다 실제 이벤트 수신 완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WrongwayIngestResponse" },
              },
            },
          },
        },
      },
    },
    "/api/ingest/lidar/mock": {
      post: {
        tags: ["External Ingest"],
        summary: "라이다 PC mock HTTP 이벤트 수신",
        description:
          "개발자 또는 Swagger/curl 테스트에서 라이다 수신 흐름을 확인하기 위한 mock API입니다. 실제 라이다 PC 연동 안내는 /api/wrongway를 기준으로 합니다. DEVICE_INGEST_API_KEY가 설정된 환경에서는 X-Device-Key header가 필요합니다.",
        security: [{ deviceKeyAuth: [] }, {}],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LidarIngestRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "라이다 외부 이벤트 수신 완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WrongwayIngestResponse" },
              },
            },
          },
        },
      },
    },
    "/api/ingest/control-board": {
      post: {
        tags: ["External Ingest"],
        summary: "통합 제어보드 실제 HTTP 패킷 수신",
        description:
          "통합 제어보드 또는 중간 브릿지 프로그램이 실제 패킷을 HTTP JSON으로 넘길 때 사용하는 API입니다. RS-485 직접 연결이 확정되기 전까지 실제 수신 진입점으로 유지하고, 내부에서는 mock과 같은 parser/adapter 흐름을 사용합니다. DEVICE_INGEST_API_KEY가 설정된 환경에서는 X-Device-Key header가 필요합니다.",
        security: [{ deviceKeyAuth: [] }, {}],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ControlBoardMockRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "통합 제어보드 실제 패킷 수신 완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExternalIngestResponse" },
              },
            },
          },
        },
      },
    },
    "/api/ingest/control-board/mock": {
      post: {
        tags: ["External Ingest"],
        summary: "통합 제어보드 mock 패킷 수신",
        description: "RS-485 10바이트 패킷 adapter 흐름을 HTTP로 먼저 테스트하기 위한 API입니다. packet이 있으면 Byte 1~6 기준 CRC-8/SMBUS를 계산해 Byte 7 값과 비교합니다. DEVICE_INGEST_API_KEY가 설정된 환경에서는 X-Device-Key header가 필요합니다.",
        security: [{ deviceKeyAuth: [] }, {}],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ControlBoardMockRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "통합 제어보드 mock 패킷 수신 완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExternalIngestResponse" },
              },
            },
          },
        },
      },
    },
    "/api/ingest/control-board/serial/test": {
      post: {
        tags: ["External Ingest"],
        summary: "통합 제어보드 serial reader 테스트",
        description: "실제 COM 포트를 열거나 serialport 의존성을 추가하지 않고, 현장 테스트에 필요한 포트/보드레이트/샘플 패킷 입력 형태만 확인합니다. DEVICE_INGEST_API_KEY가 설정된 환경에서는 X-Device-Key header가 필요합니다.",
        security: [{ deviceKeyAuth: [] }, {}],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ControlBoardSerialTestRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "serial reader 테스트 요청 접수",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ControlBoardSerialTestResponse" },
              },
            },
          },
        },
      },
    },
    "/api/ingest/events/recent": {
      get: {
        tags: ["External Ingest"],
        summary: "최근 외부 수신 이벤트 조회",
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", example: 20 },
          },
        ],
        responses: {
          200: {
            description: "최근 외부 수신 이벤트 목록",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/ExternalEvent" },
                },
              },
            },
          },
        },
      },
    },
    "/api/ingest/status": {
      get: {
        tags: ["External Ingest"],
        summary: "외부 수신 상태 조회",
        description:
          "라이다 PC와 통합 제어보드에서 최근 수신된 이벤트를 기준으로 마지막 수신 시각, 최근 오류 패킷 수, 최근 오류 이벤트를 요약합니다. 현장 테스트에서 수신 여부를 빠르게 확인하기 위한 API입니다.",
        responses: {
          200: {
            description: "외부 수신 상태 요약",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IngestStatusResponse" },
              },
            },
          },
        },
      },
    },
    "/api/demo/start": {
      post: {
        tags: ["Demo"],
        summary: "감지 데모 시작",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          200: {
            description: "감지 데모 시작 완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DemoResponse" },
              },
            },
          },
          500: {
            description: "감지 데모 시작 실패",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/demo/reset": {
      post: {
        tags: ["Demo"],
        summary: "감지 데모 초기화",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          200: {
            description: "감지 데모 초기화 완료",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DemoResponse" },
              },
            },
          },
          500: {
            description: "감지 데모 초기화 실패",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      deviceKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-Device-Key",
        description:
          "Optional device ingest key. Required only when DEVICE_INGEST_API_KEY is set in the backend environment.",
      },
    },
    schemas: {
      AuthLoginRequest: {
        type: "object",
        required: ["userId", "password"],
        properties: {
          userId: { type: "string", example: "admin" },
          password: { type: "string", example: "admin1234!" },
        },
      },
      AuthUser: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string", example: "admin" },
          name: { type: "string", example: "System Administrator" },
          role: { type: "string", example: "SUPER_ADMIN" },
          isActive: { type: "boolean", example: true },
          lastLoginAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      AuthLoginResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          token: { type: "string" },
          tokenType: { type: "string", example: "Bearer" },
          user: { $ref: "#/components/schemas/AuthUser" },
        },
      },
      AuthMeResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          user: { $ref: "#/components/schemas/AuthUser" },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          ts: { type: "string", format: "date-time" },
        },
      },
      DatabaseHealthResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          checkedAt: { type: "string", format: "date-time" },
          database: { type: "string", example: "postgresql" },
          tables: {
            type: "object",
            properties: {
              users: { type: "integer", example: 0 },
              sites: { type: "integer", example: 1 },
              zones: { type: "integer", example: 2 },
              devices: { type: "integer", example: 4 },
              vehicleTracks: { type: "integer", example: 0 },
              trafficEvents: { type: "integer", example: 0 },
              eventLogs: { type: "integer", example: 0 },
              controlCommands: { type: "integer", example: 0 },
              controlCommandLogs: { type: "integer", example: 0 },
              deviceStatusLogs: { type: "integer", example: 0 },
            },
          },
        },
      },
      DatabaseHealthErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          checkedAt: { type: "string", format: "date-time" },
          message: {
            type: "string",
            example: "DB 연결 또는 기본 테이블 조회에 실패했습니다.",
          },
        },
      },
      Site: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          name: { type: "string", example: "월출산휴게소" },
          location: { type: "string", nullable: true, example: "전라남도 영암군" },
          description: { type: "string", nullable: true },
          zones: {
            type: "array",
            items: { $ref: "#/components/schemas/Zone" },
          },
        },
      },
      Zone: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          siteId: { type: "string" },
          zoneCode: { type: "string", nullable: true, example: "ROUNDABOUT-01" },
          name: { type: "string", example: "회전교차로 1" },
          type: { type: "string", nullable: true, example: "ROUNDABOUT" },
          description: { type: "string", nullable: true },
          devices: {
            type: "array",
            items: { $ref: "#/components/schemas/Device" },
          },
        },
      },
      Device: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          zoneId: { type: "string" },
          deviceCode: { type: "string", nullable: true, example: "CONTROL-BOARD-01" },
          name: { type: "string", example: "회전교차로 1 통합제어보드" },
          deviceType: { type: "string", example: "CONTROL_BOARD" },
          status: { type: "string", example: "UNKNOWN" },
          healthStatus: { type: "string", example: "UNKNOWN" },
          ipAddress: { type: "string", nullable: true, example: "192.168.0.50" },
          port: { type: "integer", nullable: true, example: 5001 },
          lastSeenAt: { type: "string", format: "date-time", nullable: true },
          installedLocation: { type: "string", nullable: true, example: "회전교차로 1" },
          latestStatusLog: {
            nullable: true,
            oneOf: [{ $ref: "#/components/schemas/DeviceStatusLog" }],
          },
        },
      },
      DeviceStatusLog: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          deviceId: { type: "string", nullable: true },
          source: { type: "string", example: "CONTROL_BOARD" },
          status: { type: "string", example: "UNKNOWN" },
          health: { type: "string", nullable: true, example: "UNKNOWN" },
          message: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      SiteListResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          total: { type: "integer", example: 1 },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Site" },
          },
        },
      },
      ZoneListResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          total: { type: "integer", example: 2 },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Zone" },
          },
        },
      },
      DeviceListResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          total: { type: "integer", example: 4 },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/Device" },
          },
        },
      },
      DeviceStatusSummaryResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          total: { type: "integer", example: 4 },
          configured: { type: "boolean", example: true },
          byStatus: { type: "object", additionalProperties: { type: "integer" } },
          byHealthStatus: { type: "object", additionalProperties: { type: "integer" } },
          byType: { type: "object", additionalProperties: { type: "integer" } },
          latestStatusLog: {
            nullable: true,
            oneOf: [{ $ref: "#/components/schemas/DeviceStatusLog" }],
          },
          latestCommand: {
            nullable: true,
            oneOf: [{ $ref: "#/components/schemas/ControlBoardCommand" }],
          },
        },
      },
      SystemStatusResponse: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean", example: true },
          checkedAt: { type: "string", format: "date-time" },
          server: {
            type: "object",
            properties: {
              ok: { type: "boolean", example: true },
              status: { type: "string", example: "ONLINE" },
              uptimeSeconds: { type: "integer", example: 3600 },
              nodeVersion: { type: "string", example: "v22.0.0" },
            },
          },
          database: {
            type: "object",
            properties: {
              ok: { type: "boolean", example: true },
              status: { type: "string", example: "ONLINE" },
            },
          },
          ingest: {
            type: "object",
            properties: {
              ok: { type: "boolean", example: true },
              status: { type: "string", example: "RECEIVING_OR_READY" },
            },
          },
          websocket: {
            type: "object",
            properties: {
              ok: { type: "boolean", example: true },
              status: { type: "string", example: "AVAILABLE" },
            },
          },
          devices: { $ref: "#/components/schemas/DeviceStatusSummaryResponse" },
          controlBoard: { $ref: "#/components/schemas/ControlBoardStatusResponse" },
        },
      },
      OkResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          error: { type: "string" },
        },
      },
      ControlBoardCommand: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          commandCode: { type: "string", example: "cmd-stage_1_on-1782972000000-a1b2c3d4" },
          commandType: {
            type: "string",
            enum: ["STAGE_1_ON", "STAGE_2_ON", "STAGE_2_RETURN", "SYSTEM_RESET"],
            example: "STAGE_1_ON",
          },
          status: {
            type: "string",
            enum: ["PENDING", "DRY_RUN", "SENT", "ACKNOWLEDGED", "FAILED"],
            example: "DRY_RUN",
          },
          transport: { type: "string", example: "TCP" },
          trafficEventId: { type: "string", nullable: true },
          mode: { type: "string", example: "STAGE_1" },
          statusCode: { type: "string", example: "0x01" },
          selectCode: { type: "string", example: "0x02" },
          packetHex: { type: "string", example: "02 A1 10 01 01 02 00 9B 03 0D" },
          responseHex: { type: "string", nullable: true },
          crcStatus: { type: "string", nullable: true, example: "VALID" },
          errorMessage: { type: "string", nullable: true },
          requestedAt: { type: "string", format: "date-time" },
          sentAt: { type: "string", format: "date-time", nullable: true },
          acknowledgedAt: { type: "string", format: "date-time", nullable: true },
          completedAt: { type: "string", format: "date-time", nullable: true },
          logs: {
            type: "array",
            items: { $ref: "#/components/schemas/EventLog" },
          },
        },
      },
      ControlBoardStatusResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          mode: { type: "string", example: "DRY_RUN" },
          transport: { type: "string", example: "tcp" },
          hostConfigured: { type: "boolean", example: false },
          portConfigured: { type: "boolean", example: false },
          connectTimeoutMs: { type: "integer", example: 1000 },
          responseTimeoutMs: { type: "integer", example: 1000 },
          retryCount: { type: "integer", example: 1 },
          heartbeatIntervalMs: { type: "integer", example: 5000 },
          byStatus: { type: "object", additionalProperties: { type: "integer" } },
          latestCommand: {
            nullable: true,
            oneOf: [{ $ref: "#/components/schemas/ControlBoardCommand" }],
          },
        },
      },
      ControlBoardCommandListResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          total: { type: "integer", example: 1 },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ControlBoardCommand" },
          },
        },
      },
      ControlBoardCommandTestRequest: {
        type: "object",
        properties: {
          commandType: {
            type: "string",
            enum: ["STAGE_1_ON", "STAGE_2_ON", "STAGE_2_RETURN", "SYSTEM_RESET"],
            example: "STAGE_1_ON",
          },
        },
      },
      ControlBoardCommandTestResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          command: { $ref: "#/components/schemas/ControlBoardCommand" },
        },
      },
      DashboardState: {
        type: "object",
        properties: {
          siteId: { type: "string", example: "Site-01" },
          deviceId: { type: "string", example: "LIDAR-01" },
          todaysEvents: { type: "integer", example: 3 },
          vehiclesPassed: { type: "integer", example: 12842 },
          wrongWayEvents: { type: "integer", example: 2 },
          unidentified: { type: "integer", example: 24 },
          lidar: {
            type: "object",
            properties: {
              pts: { type: "integer", example: 2405 },
              hz: { type: "integer", example: 10 },
            },
          },
          gate: { type: "string", enum: ["OPENED", "CLOSED"], example: "CLOSED" },
          vmsLast: { type: "string", example: "" },
        },
      },
      LogItem: {
        type: "object",
        properties: {
          msg: { type: "string", example: "System boot completed" },
          time: { type: "string", example: "10:42:00 AM" },
        },
      },
      GateResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          gate: { type: "string", enum: ["OPENED", "CLOSED"], example: "OPENED" },
        },
      },
      VmsRequest: {
        type: "object",
        properties: {
          text: { type: "string", maxLength: 80, example: "역주행 차량 주의" },
        },
      },
      VmsResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          vmsLast: { type: "string", example: "역주행 차량 주의" },
        },
      },
      ControlStatusResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          checkedAt: { type: "string", format: "date-time" },
          siteId: { type: "string", example: "Site-01" },
          deviceId: { type: "string", example: "LIDAR-01" },
          gate: { type: "string", enum: ["OPENED", "CLOSED"], example: "CLOSED" },
          vmsLast: { type: "string", example: "역주행 차량 주의" },
          lidar: {
            type: "object",
            properties: {
              pts: { type: "integer", example: 2405 },
              hz: { type: "integer", example: 10 },
            },
          },
          counters: {
            type: "object",
            properties: {
              todaysEvents: { type: "integer", example: 3 },
              newEvents: { type: "integer", example: 1 },
              wrongWayEvents: { type: "integer", example: 2 },
              vehiclesPassed: { type: "integer", example: 12842 },
            },
          },
        },
      },
      WrongwayRequest: {
        type: "object",
        additionalProperties: true,
        properties: {
          type: {
            type: "string",
            enum: ["normal-driving", "wrong-way-level-1", "wrong-way-level-2", "situation-ended"],
            example: "wrong-way-level-1",
          },
          timestamp: { type: "string", format: "date-time" },
          zone_id: { type: "string", example: "Z327" },
          track_id: { type: "string", example: "grid_16648_16670" },
          warning_level: { type: "integer", example: 1 },
          speed_ms: { type: "number", example: 2.917 },
          speed_kmh: { type: "number", example: 10.502 },
          object_class: { type: "integer", example: 6 },
          uuid: { type: "string", example: "82760000" },
          description: { type: "string", example: "Wrong-way driving detected" },
          consecutive_count: { type: "integer", example: 3 },
          is_confirmed: { type: "boolean", example: true },
          normal_moving_vehicle_count: { type: "integer", example: 4 },
          confidence: { type: "number", example: 0.92 },
          message: { type: "string", example: "Vehicle detected" },
        },
      },
      WrongwayIngestResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          eventId: { type: "string", nullable: true, example: "clx-event-id" },
          receivedAt: { type: "string", format: "date-time" },
          vehicleTrackCreated: { type: "boolean", example: true },
          eventCreated: {
            type: "boolean",
            example: true,
            description: "False when an existing active event was updated.",
          },
          eventReused: {
            type: "boolean",
            example: false,
            description: "True when track_id + event type matched an unresolved existing event.",
          },
          resolvedEventIds: {
            type: "array",
            items: { type: "string" },
            description: "Wrong-way event ids resolved by a situation-ended payload.",
          },
          controlCommand: {
            nullable: true,
            oneOf: [{ $ref: "#/components/schemas/ControlBoardCommand" }],
          },
          event: {
            oneOf: [
              { $ref: "#/components/schemas/TrafficEvent" },
              {
                type: "object",
                additionalProperties: true,
                description: "normal-driving can return vehicle track information without a traffic event.",
              },
            ],
          },
        },
      },
      TrafficEvent: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          eventCode: { type: "string", nullable: true },
          eventType: { type: "string", example: "wrong-way-level-1" },
          status: { type: "string", example: "NEW" },
          occurredAt: { type: "string", format: "date-time", nullable: true },
          receivedAt: { type: "string", format: "date-time" },
          zoneId: { type: "string", nullable: true },
          externalZoneId: { type: "string", nullable: true, example: "Z327" },
          trackId: { type: "string", nullable: true },
          warningLevel: { type: "integer", nullable: true },
          confidence: { type: "number", nullable: true },
          speedMs: { type: "number", nullable: true },
          speedKmh: { type: "number", nullable: true },
          objectClass: { type: "integer", nullable: true },
          objectUuid: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          consecutiveCount: { type: "integer", nullable: true },
          isConfirmed: { type: "boolean", nullable: true },
          normalMovingVehicleCount: { type: "integer", nullable: true },
          rawPayload: { type: "object", additionalProperties: true },
          eventLogs: {
            type: "array",
            items: { $ref: "#/components/schemas/EventLog" },
          },
          controlCommands: {
            type: "array",
            items: { $ref: "#/components/schemas/ControlBoardCommand" },
          },
        },
      },
      EventLog: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string" },
          eventId: { type: "string", nullable: true },
          action: { type: "string", example: "TRAFFIC_EVENT_RECEIVED" },
          message: { type: "string", nullable: true },
          metadata: { type: "object", additionalProperties: true, nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      EventListResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          total: { type: "integer", example: 12 },
          limit: { type: "integer", example: 20 },
          offset: { type: "integer", example: 0 },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/TrafficEvent" },
          },
        },
      },
      EventSummaryResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          total: { type: "integer", example: 12 },
          today: { type: "integer", example: 3 },
          vehiclesPassed: { type: "integer", example: 12842 },
          vehicleTracks: { type: "integer", example: 12842 },
          todayVehicleTracks: { type: "integer", example: 114 },
          newEvents: { type: "integer", example: 2 },
          byStatus: { type: "object", additionalProperties: { type: "integer" } },
          byEventType: { type: "object", additionalProperties: { type: "integer" } },
          lastEventId: { type: "string", nullable: true },
          lastReceivedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      TrafficStatisticsMetrics: {
        type: "object",
        properties: {
          vehiclesTotal: { type: "integer", example: 12842 },
          normalVehicles: { type: "integer", example: 12821 },
          wrongwayVehicles: { type: "integer", example: 21 },
          wrongwayEvents: { type: "integer", example: 24 },
          wrongwayRate: { type: "number", example: 0.16 },
          stage1Events: { type: "integer", example: 19 },
          stage2Events: { type: "integer", example: 5 },
          controlCommands: { type: "integer", example: 24 },
          dryRunCommands: { type: "integer", example: 20 },
          liveCommands: { type: "integer", example: 4 },
          acknowledgedCommands: { type: "integer", example: 3 },
          failedCommands: { type: "integer", example: 1 },
          commandSuccessRate: { type: "number", nullable: true, example: 75 },
        },
      },
      TrafficStatisticsBucket: {
        allOf: [
          { $ref: "#/components/schemas/TrafficStatisticsMetrics" },
          {
            type: "object",
            properties: {
              key: { type: "string", example: "hour-8" },
              label: { type: "string", example: "08:00" },
              start: { type: "string", format: "date-time" },
              end: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      TrafficStatisticsZone: {
        allOf: [
          { $ref: "#/components/schemas/TrafficStatisticsMetrics" },
          {
            type: "object",
            properties: {
              zoneCode: { type: "string", nullable: true, example: "ROUNDABOUT-01" },
              name: { type: "string", example: "Roundabout entrance" },
            },
          },
        ],
      },
      TrafficStatisticsResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          range: { type: "string", example: "daily" },
          bucketUnit: { type: "string", example: "hour" },
          generatedAt: { type: "string", format: "date-time" },
          period: {
            type: "object",
            properties: {
              start: { type: "string", format: "date-time" },
              end: { type: "string", format: "date-time" },
            },
          },
          totals: { $ref: "#/components/schemas/TrafficStatisticsMetrics" },
          buckets: {
            type: "array",
            items: { $ref: "#/components/schemas/TrafficStatisticsBucket" },
          },
          zones: {
            type: "array",
            items: { $ref: "#/components/schemas/TrafficStatisticsZone" },
          },
        },
      },
      ExternalEvent: {
        type: "object",
        properties: {
          id: { type: "string", example: "evt-001" },
          source: { type: "string", example: "LIDAR_PC" },
          eventType: { type: "string", example: "WRONG_WAY" },
          stage: { type: "integer", example: 1 },
          siteId: { type: "string", example: "Site-01" },
          zoneId: { type: "string", example: "ROUNDABOUT-01" },
          deviceId: { type: "string", example: "LIDAR-01" },
          trackId: { type: "string", example: "track-001" },
          message: { type: "string", example: "라이다 역주행 감지 이벤트 수신" },
          externalOccurredAt: {
            type: "string",
            description: "외부 장비가 보낸 원본 시간 값입니다. 잘못된 형식이어도 데이터 확인을 위해 그대로 보관합니다.",
            nullable: true,
            example: "2026-06-22T10:15:30+09:00",
          },
          occurredAt: { type: "string", format: "date-time" },
          receivedAt: { type: "string", format: "date-time" },
          isOccurredAtValid: { type: "boolean", example: true },
          timeSkewMs: {
            type: "integer",
            nullable: true,
            example: -120,
            description: "외부 장비 시간과 백엔드 수신 시간의 차이입니다. 외부 장비 시간 - 백엔드 수신 시간 기준이며 단위는 ms입니다.",
          },
          confidence: { type: "number", example: 0.92 },
          rawPayload: {
            type: "object",
            additionalProperties: true,
            description: "현장 연동 테스트에서 실제 수신 데이터 형식을 확인하기 위한 원본 payload입니다. 운영 전에는 노출/저장 범위를 다시 제한해야 합니다.",
          },
          rawSummary: {
            type: "object",
            additionalProperties: true,
            description: "원본 payload의 필드 목록, 크기, 제어보드 패킷 파싱 결과, CRC 검증 결과를 담는 진단 정보입니다.",
          },
        },
      },
      IngestStatusResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          checkedAt: { type: "string", format: "date-time" },
          storage: { type: "string", example: "MEMORY" },
          totalRecentEvents: { type: "integer", example: 5 },
          invalidRecentEvents: { type: "integer", example: 1 },
          lastReceivedAt: { type: "string", format: "date-time", nullable: true },
          lastLidarReceivedAt: { type: "string", format: "date-time", nullable: true },
          lastControlBoardReceivedAt: { type: "string", format: "date-time", nullable: true },
          lastEvent: {
            nullable: true,
            oneOf: [{ $ref: "#/components/schemas/ExternalEvent" }],
          },
          lastInvalidEvent: {
            nullable: true,
            oneOf: [{ $ref: "#/components/schemas/ExternalEvent" }],
          },
        },
      },
      LidarIngestRequest: {
        type: "object",
        additionalProperties: true,
        properties: {
          id: { type: "string", example: "evt-lidar-001" },
          stage: { type: "integer", example: 1 },
          zone_id: { type: "string", example: "ROUNDABOUT-01" },
          device_id: { type: "string", example: "LIDAR-01" },
          track_id: { type: "string", example: "track-001" },
          confidence: { type: "number", example: 0.92 },
          timestamp: { type: "string", format: "date-time" },
          message: { type: "string", example: "라이다 역주행 감지 이벤트 수신" },
        },
      },
      ControlBoardMockRequest: {
        type: "object",
        additionalProperties: true,
        properties: {
          packet: {
            oneOf: [
              { type: "string", example: "02 A1 20 01 01 02 00 CD 03 0D" },
              {
                type: "array",
                items: { type: "integer" },
                example: [2, 161, 32, 1, 1, 2, 0, 205, 3, 13],
              },
            ],
          },
          command: {
            type: "string",
            enum: ["STAGE_1_ON", "STAGE_2_ON", "STAGE_2_RETURN", "SYSTEM_RESET", "UNKNOWN"],
            example: "STAGE_1_ON",
          },
          crcValid: {
            type: "boolean",
            example: true,
            description: "packet 없이 command만 테스트할 때 사용하는 임시 CRC 상태 값입니다. packet이 있으면 실제 CRC-8 계산 결과가 우선 적용됩니다.",
          },
          zone_id: { type: "string", example: "ROUNDABOUT-01" },
          device_id: { type: "string", example: "CONTROL-BOARD-01" },
        },
      },
      ControlBoardSerialTestRequest: {
        type: "object",
        properties: {
          port: { type: "string", example: "COM3" },
          baudRate: { type: "integer", example: 9600 },
          samplePacket: { type: "string", example: "02 A1 20 01 01 02 00 CD 03 0D" },
          command: { type: "string", example: "STAGE_1_ON" },
        },
      },
      ExternalIngestResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          eventId: { type: "string", example: "evt-001" },
          receivedAt: { type: "string", format: "date-time" },
          event: { $ref: "#/components/schemas/ExternalEvent" },
        },
      },
      ControlBoardSerialTestResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          mode: { type: "string", example: "SERIAL_READER_NOT_CONNECTED" },
          serial: {
            type: "object",
            properties: {
              port: { type: "string", example: "COM3" },
              baudRate: { type: "integer", example: 9600 },
            },
          },
          event: { $ref: "#/components/schemas/ExternalEvent" },
        },
      },
      DemoResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: true },
          detector: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
