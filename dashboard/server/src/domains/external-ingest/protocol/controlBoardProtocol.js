const PACKET_LENGTH = 10;

// PDF 기준 통합 제어보드 패킷은 항상 10바이트 고정이다.
// Byte 0: STX, Byte 1: ID, Byte 2: TYPE, Byte 3: MODE, Byte 4: STATUS,
// Byte 5: SELECT, Byte 6: RESERVED, Byte 7: CRC, Byte 8: ETX, Byte 9: EOF(CR)
const STX = 0x02;
const DEVICE_ID = 0xa1;
const ETX = 0x03;
const EOF = 0x0d;

// TYPE은 패킷이 PC/백엔드에서 보낸 명령인지, 보드가 돌려준 응답 로그인지 구분한다.
const TYPE_LABEL = {
  0x10: "COMMAND",
  0x20: "RESPONSE_LOG",
};

const TYPE_CODE = {
  COMMAND: 0x10,
  RESPONSE_LOG: 0x20,
};

// MODE는 역주행 경고 단계를 표현한다. 화면에서는 stage 값으로 다시 매핑된다.
const MODE_LABEL = {
  0x00: "WAIT",
  0x01: "STAGE_1",
  0x02: "STAGE_2",
};

const MODE_CODE = {
  WAIT: 0x00,
  STAGE_1: 0x01,
  STAGE_2: 0x02,
};

// STATUS는 장비 동작 상태를 표현한다. 0x02는 차단기 복귀/상승 상황으로 해석한다.
const STATUS_LABEL = {
  0x00: "OFF",
  0x01: "ON",
  0x02: "BARRIER_RETURN",
};

const STATUS_CODE = {
  OFF: 0x00,
  ON: 0x01,
  BARRIER_RETURN: 0x02,
};

// SELECT는 어떤 설비 묶음을 제어하는지 나타낸다. 현재는 진단 정보로만 보관한다.
const SELECT_LABEL = {
  0x01: "ALL",
  0x02: "WARNING_SET",
  0x03: "SAFETY_SET",
  0x10: "LED_ONLY",
  0x11: "SPEAKER_ONLY",
  0x12: "BARRIER_ONLY",
};

const SELECT_CODE = {
  ALL: 0x01,
  WARNING_SET: 0x02,
  SAFETY_SET: 0x03,
  LED_ONLY: 0x10,
  SPEAKER_ONLY: 0x11,
  BARRIER_ONLY: 0x12,
};

const COMMAND_DEFINITION = {
  STAGE_1_ON: {
    mode: MODE_CODE.STAGE_1,
    status: STATUS_CODE.ON,
    select: SELECT_CODE.WARNING_SET,
    label: "Stage 1 warning on",
  },
  STAGE_2_ON: {
    mode: MODE_CODE.STAGE_2,
    status: STATUS_CODE.ON,
    select: SELECT_CODE.WARNING_SET,
    label: "Stage 2 warning on",
  },
  STAGE_2_RETURN: {
    mode: MODE_CODE.STAGE_2,
    status: STATUS_CODE.BARRIER_RETURN,
    select: SELECT_CODE.WARNING_SET,
    label: "Stage 2 barrier return",
  },
  SYSTEM_RESET: {
    mode: MODE_CODE.WAIT,
    status: STATUS_CODE.OFF,
    select: SELECT_CODE.WARNING_SET,
    label: "System reset",
  },
};

function toHex(byte) {
  return `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}

function parseByteToken(token) {
  const normalized = String(token).trim();
  if (!normalized) return null;

  // "A1"과 "0xA1"을 모두 허용한다. Swagger/curl에서 입력 방식이 섞일 수 있기 때문이다.
  const value = normalized.toLowerCase().startsWith("0x")
    ? Number.parseInt(normalized.slice(2), 16)
    : Number.parseInt(normalized, 16);

  if (!Number.isInteger(value) || value < 0 || value > 0xff) return null;
  return value;
}

function normalizePacket(packet) {
  // RS-485 serial reader가 붙기 전에는 HTTP mock API로 패킷을 테스트한다.
  // 그래서 "02 A1 10 ..." 같은 HEX 문자열과 [2, 161, ...] 바이트 배열을 모두 같은 배열로 정규화한다.
  if (Array.isArray(packet)) {
    const bytes = packet.map((value) => {
      if (typeof value === "number") return value;
      return parseByteToken(value);
    });

    if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 0xff)) {
      return { ok: false, error: "패킷 배열에는 0~255 범위의 바이트 값만 사용할 수 있습니다.", bytes: [] };
    }

    return { ok: true, bytes };
  }

  if (typeof packet === "string") {
    const trimmed = packet.trim();
    if (!trimmed) return { ok: false, error: "패킷 문자열이 비어 있습니다.", bytes: [] };

    // 공백/콤마로 구분된 입력과 "02A110..."처럼 붙어 있는 입력을 모두 지원한다.
    const tokens = trimmed.includes(" ") || trimmed.includes(",")
      ? trimmed.split(/[\s,]+/).filter(Boolean)
      : trimmed.match(/.{1,2}/g) || [];

    const bytes = tokens.map(parseByteToken);
    if (bytes.some((value) => value === null)) {
      return { ok: false, error: "패킷 문자열에는 HEX 바이트만 사용할 수 있습니다.", bytes: [] };
    }

    return { ok: true, bytes };
  }

  return { ok: false, error: "packet은 HEX 문자열 또는 바이트 배열이어야 합니다.", bytes: [] };
}

function calculateCrc8Smbus(dataBytes) {
  // CRC 계산 범위는 PDF 기준 Byte 1~6, 즉 ID부터 RESERVED까지다.
  // STX(0x02), CRC Byte, ETX(0x03), EOF(0x0D)는 계산에 포함하지 않는다.
  // PDF에는 LSB-First라고 적혀 있지만, 문서의 테스트 벡터는 표준 CRC-8/SMBUS(MSB-first) 결과와 일치한다.
  // 따라서 안전하게 문서의 기대 CRC 값을 정답으로 보고 poly 0x07, init 0x00 방식으로 구현한다.
  let crc = 0x00;

  for (const byte of dataBytes) {
    // 각 바이트를 현재 CRC에 XOR한 뒤 8비트씩 밀면서 다항식 0x07을 적용한다.
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x80) !== 0
        ? ((crc << 1) ^ 0x07) & 0xff
        : (crc << 1) & 0xff;
    }
  }

  return crc;
}

function buildControlBoardCommandPacket(commandType) {
  const definition = COMMAND_DEFINITION[commandType];
  if (!definition) {
    const error = new Error(`Unsupported control board command type: ${commandType}`);
    error.status = 400;
    throw error;
  }

  const bytes = [
    STX,
    DEVICE_ID,
    TYPE_CODE.COMMAND,
    definition.mode,
    definition.status,
    definition.select,
    0x00,
    0x00,
    ETX,
    EOF,
  ];
  bytes[7] = calculateCrc8Smbus(bytes.slice(1, 7));

  return {
    commandType,
    label: definition.label,
    bytes,
    buffer: Buffer.from(bytes),
    hex: bytes.map(toHex),
    packetHex: bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" "),
    crc: bytes[7],
    mode: MODE_LABEL[definition.mode],
    status: STATUS_LABEL[definition.status],
    select: SELECT_LABEL[definition.select],
    modeCode: toHex(definition.mode),
    statusCode: toHex(definition.status),
    selectCode: toHex(definition.select),
  };
}

function getProtocolCommand(parsed) {
  // PDF의 시나리오 4개를 command로 그대로 분리한다.
  // 나중에 프로토콜이 바뀌어도 이 함수만 보면 어떤 MODE/STATUS 조합을 어떤 상황으로 보는지 추적하기 쉽다.
  if (parsed.mode === "STAGE_1" && parsed.status === "ON") return "STAGE_1_ON";
  if (parsed.mode === "STAGE_2" && parsed.status === "ON") return "STAGE_2_ON";
  if (parsed.mode === "STAGE_2" && parsed.status === "BARRIER_RETURN") return "STAGE_2_RETURN";
  if (parsed.mode === "WAIT" && parsed.status === "OFF") return "SYSTEM_RESET";
  return "UNKNOWN";
}

function parseControlBoardPacket(packet) {
  // 이 함수는 외부에서 들어온 packet 하나를 검증 가능한 진단 객체로 바꾼다.
  // adapter는 이 결과를 rawSummary에 넣어 Swagger/최근 이벤트 조회에서 확인할 수 있게 한다.
  const normalized = normalizePacket(packet);
  if (!normalized.ok) {
    return {
      isValid: false,
      error: normalized.error,
      bytes: normalized.bytes,
      packetSize: normalized.bytes.length,
      crcStatus: "NOT_VERIFIED",
    };
  }

  const bytes = normalized.bytes;
  const errors = [];

  // 프레임 구조 검증: 길이와 시작/종료 제어 문자가 맞아야 실제 제어보드 패킷으로 볼 수 있다.
  if (bytes.length !== PACKET_LENGTH) errors.push(`패킷 길이는 ${PACKET_LENGTH}바이트여야 합니다.`);
  if (bytes[0] !== STX) errors.push("STX 값이 0x02가 아닙니다.");
  if (bytes[1] !== DEVICE_ID) errors.push("장비 ID 값이 0xA1이 아닙니다.");
  if (bytes[8] !== ETX) errors.push("ETX 값이 0x03이 아닙니다.");
  if (bytes[9] !== EOF) errors.push("EOF 값이 0x0D가 아닙니다.");

  // CRC 검증: Byte 1~6만 잘라 계산하고, 패킷의 Byte 7과 비교한다.
  // Byte 1~6은 실제 데이터 영역이다.
  // 순서대로 ID, TYPE, MODE, STATUS, SELECT, RESERVED이며 이 6바이트만 CRC 계산에 사용한다.
  const dataArea = bytes.slice(1, 7);

  // Byte 7은 송신 측이 계산해서 넣어준 CRC 값이다.
  // 우리가 Byte 1~6으로 다시 계산한 값과 같아야 패킷이 전송 중 깨지지 않았다고 볼 수 있다.
  const expectedCrc = bytes[7];
  const calculatedCrc = dataArea.length === 6 ? calculateCrc8Smbus(dataArea) : null;
  const crcValid = calculatedCrc !== null && expectedCrc === calculatedCrc;

  if (!crcValid) errors.push("CRC-8 검증에 실패했습니다.");

  // 사람이 보기 쉬운 HEX 코드와 라벨을 함께 만든다. 이 값들은 현장 디버깅용 rawSummary에 들어간다.
  const parsed = {
    // Byte 0: 패킷 시작 표시. 항상 0x02여야 한다.
    stx: toHex(bytes[0] ?? 0),

    // Byte 1: 장비 식별 ID. PDF에서는 통합 제어보드 ID를 0xA1로 고정한다.
    id: toHex(bytes[1] ?? 0),

    // Byte 2: 패킷 종류. 0x10은 명령, 0x20은 보드 응답/로그다.
    typeCode: toHex(bytes[2] ?? 0),
    type: TYPE_LABEL[bytes[2]] || "UNKNOWN",

    // Byte 3: 경고 단계. 0x00 대기, 0x01 1차 경고, 0x02 2차 경고다.
    modeCode: toHex(bytes[3] ?? 0),
    mode: MODE_LABEL[bytes[3]] || "UNKNOWN",

    // Byte 4: 동작 상태. 0x00 OFF, 0x01 ON, 0x02 차단기 복귀/상승이다.
    statusCode: toHex(bytes[4] ?? 0),
    status: STATUS_LABEL[bytes[4]] || "UNKNOWN",

    // Byte 5: 제어 대상. 전체/경보 세트/안전 세트/개별 장비를 구분한다.
    selectCode: toHex(bytes[5] ?? 0),
    select: SELECT_LABEL[bytes[5]] || "UNKNOWN",

    // Byte 6: 예약 필드. 현재는 0x00으로 두고 추후 확장에 사용한다.
    reserved: toHex(bytes[6] ?? 0),

    // Byte 7: 송신 측 CRC 값. calculatedCrc와 비교해 무결성을 판단한다.
    crc: toHex(bytes[7] ?? 0),

    // Byte 8: 패킷 종료 표시. 항상 0x03이어야 한다.
    etx: toHex(bytes[8] ?? 0),

    // Byte 9: 최종 종료 확인 값(CR). 항상 0x0D여야 한다.
    eof: toHex(bytes[9] ?? 0),
  };

  const command = getProtocolCommand(parsed);

  return {
    isValid: errors.length === 0,
    errors,
    bytes,
    hex: bytes.map(toHex),
    packetSize: bytes.length,
    command,
    parsed,
    dataArea: dataArea.map(toHex),
    crcExpected: expectedCrc,
    crcCalculated: calculatedCrc,
    crcStatus: crcValid ? "VALID" : "INVALID",
  };
}

module.exports = {
  COMMAND_DEFINITION,
  buildControlBoardCommandPacket,
  calculateCrc8Smbus,
  parseControlBoardPacket,
};
