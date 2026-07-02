const PACKET_LENGTH = 10;

// The integrated control-board frame is always fixed to 10 bytes.
// Byte 0: STX, Byte 1: ID, Byte 2: TYPE, Byte 3: MODE, Byte 4: STATUS,
// Byte 5: SELECT, Byte 6: RESERVED, Byte 7: CRC, Byte 8: ETX, Byte 9: EOF(CR)
const STX = 0x02;
const DEVICE_ID = 0xa1;
const ETX = 0x03;
const EOF = 0x0d;

// TYPE distinguishes outbound dashboard commands from board response logs.
const TYPE_LABEL = {
  0x10: "COMMAND",
  0x20: "RESPONSE_LOG",
};

const TYPE_CODE = {
  COMMAND: 0x10,
  RESPONSE_LOG: 0x20,
};

// MODE represents the warning stage shown in the operator UI.
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

// STATUS represents device action state. 0x02 is treated as barrier return.
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

// SELECT identifies the target device group. Keep diagnostic labels explicit.
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

  // Accept both "A1" and "0xA1" so Swagger and curl samples are easy to use.
  const value = normalized.toLowerCase().startsWith("0x")
    ? Number.parseInt(normalized.slice(2), 16)
    : Number.parseInt(normalized, 16);

  if (!Number.isInteger(value) || value < 0 || value > 0xff) return null;
  return value;
}

function normalizePacket(packet) {
  // Normalize HEX strings and byte arrays into the same byte list before the
  // serial reader is connected, so HTTP mock tests exercise the same parser.
  if (Array.isArray(packet)) {
    const bytes = packet.map((value) => {
      if (typeof value === "number") return value;
      return parseByteToken(value);
    });

    if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 0xff)) {
      return { ok: false, error: "Packet arrays may contain only byte values from 0 to 255.", bytes: [] };
    }

    return { ok: true, bytes };
  }

  if (typeof packet === "string") {
    const trimmed = packet.trim();
    if (!trimmed) return { ok: false, error: "Packet string must not be empty.", bytes: [] };

    // Support whitespace/comma separated input and compact strings such as
    // "02A11001010200E2030D".
    const tokens = trimmed.includes(" ") || trimmed.includes(",")
      ? trimmed.split(/[\s,]+/).filter(Boolean)
      : trimmed.match(/.{1,2}/g) || [];

    const bytes = tokens.map(parseByteToken);
    if (bytes.some((value) => value === null)) {
      return { ok: false, error: "Packet strings may contain only HEX bytes.", bytes: [] };
    }

    return { ok: true, bytes };
  }

  return { ok: false, error: "packet must be a HEX string or byte array.", bytes: [] };
}

function calculateCrc8Smbus(dataBytes) {
  // CRC covers Byte 1..6 only: ID, TYPE, MODE, STATUS, SELECT, RESERVED.
  // STX, CRC, ETX, and EOF are not included. The verified PDF vectors match
  // CRC-8/SMBUS: poly 0x07, init 0x00, MSB-first.
  let crc = 0x00;

  for (const byte of dataBytes) {
    // XOR the next byte into the accumulator, then shift through 8 bits.
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
  // Keep the four PDF scenarios mapped to named commands so later protocol
  // changes can be traced by MODE/STATUS combinations.
  if (parsed.mode === "STAGE_1" && parsed.status === "ON") return "STAGE_1_ON";
  if (parsed.mode === "STAGE_2" && parsed.status === "ON") return "STAGE_2_ON";
  if (parsed.mode === "STAGE_2" && parsed.status === "BARRIER_RETURN") return "STAGE_2_RETURN";
  if (parsed.mode === "WAIT" && parsed.status === "OFF") return "SYSTEM_RESET";
  return "UNKNOWN";
}

function parseControlBoardPacket(packet) {
  // Convert one inbound packet into a diagnostic object that can be stored in
  // rawSummary and shown in Swagger or recent event views.
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

  // Validate frame shape before treating it as an integrated control-board frame.
  if (bytes.length !== PACKET_LENGTH) errors.push(`Packet length must be ${PACKET_LENGTH} bytes.`);
  if (bytes[0] !== STX) errors.push("STX must be 0x02.");
  if (bytes[1] !== DEVICE_ID) errors.push("Device ID must be 0xA1.");
  if (bytes[8] !== ETX) errors.push("ETX must be 0x03.");
  if (bytes[9] !== EOF) errors.push("EOF must be 0x0D.");

  // Compare the transmitted Byte 7 CRC with a fresh calculation over Byte 1..6.
  const dataArea = bytes.slice(1, 7);

  const expectedCrc = bytes[7];
  const calculatedCrc = dataArea.length === 6 ? calculateCrc8Smbus(dataArea) : null;
  const crcValid = calculatedCrc !== null && expectedCrc === calculatedCrc;

  if (!crcValid) errors.push("CRC-8 validation failed.");

  // Keep parsed labels and HEX codes together for field debugging.
  const parsed = {
    // Byte 0: frame start marker.
    stx: toHex(bytes[0] ?? 0),

    // Byte 1: integrated control-board device ID.
    id: toHex(bytes[1] ?? 0),

    // Byte 2: frame type. 0x10 is command; 0x20 is response/log.
    typeCode: toHex(bytes[2] ?? 0),
    type: TYPE_LABEL[bytes[2]] || "UNKNOWN",

    // Byte 3: warning stage.
    modeCode: toHex(bytes[3] ?? 0),
    mode: MODE_LABEL[bytes[3]] || "UNKNOWN",

    // Byte 4: action state.
    statusCode: toHex(bytes[4] ?? 0),
    status: STATUS_LABEL[bytes[4]] || "UNKNOWN",

    // Byte 5: target selection.
    selectCode: toHex(bytes[5] ?? 0),
    select: SELECT_LABEL[bytes[5]] || "UNKNOWN",

    // Byte 6: reserved for future expansion.
    reserved: toHex(bytes[6] ?? 0),

    // Byte 7: transmitted CRC value.
    crc: toHex(bytes[7] ?? 0),

    // Byte 8: frame end marker.
    etx: toHex(bytes[8] ?? 0),

    // Byte 9: final CR marker.
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

function validateControlBoardCommandResponse(commandType, parsed) {
  const errors = [];

  if (!parsed?.isValid) {
    errors.push(...(parsed?.errors || ["Invalid control board response."]));
  }

  if (parsed?.crcStatus !== "VALID") {
    errors.push("Control board response CRC is not valid.");
  }

  if (parsed?.parsed?.type !== "RESPONSE_LOG") {
    errors.push(`Control board response type must be RESPONSE_LOG, got ${parsed?.parsed?.type || "UNKNOWN"}.`);
  }

  if (parsed?.command !== commandType) {
    errors.push(`Control board response command mismatch: expected ${commandType}, got ${parsed?.command || "UNKNOWN"}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  COMMAND_DEFINITION,
  buildControlBoardCommandPacket,
  calculateCrc8Smbus,
  parseControlBoardPacket,
  validateControlBoardCommandResponse,
};
