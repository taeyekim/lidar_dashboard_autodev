const {
  buildControlBoardCommandPacket,
  parseControlBoardPacket,
} = require("../src/domains/external-ingest/protocol/controlBoardProtocol");

const commandVectors = [
  ["STAGE_1_ON", "02 A1 10 01 01 02 00 9B 03 0D"],
  ["STAGE_2_ON", "02 A1 10 02 01 02 00 A1 03 0D"],
  ["STAGE_2_RETURN", "02 A1 10 02 02 02 00 1C 03 0D"],
  ["SYSTEM_RESET", "02 A1 10 00 00 02 00 E6 03 0D"],
];

const responseVectors = [
  ["STAGE_1_ON", "02 A1 20 01 01 02 00 CD 03 0D"],
  ["STAGE_2_ON", "02 A1 20 02 01 02 00 F7 03 0D"],
  ["STAGE_2_RETURN", "02 A1 20 02 02 02 00 4A 03 0D"],
  ["SYSTEM_RESET", "02 A1 20 00 00 02 00 B0 03 0D"],
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const [commandType, expectedHex] of commandVectors) {
  const packet = buildControlBoardCommandPacket(commandType);
  assert(packet.packetHex === expectedHex, `${commandType} packet mismatch: ${packet.packetHex}`);
}

for (const [commandType, responseHex] of responseVectors) {
  const parsed = parseControlBoardPacket(responseHex);
  assert(parsed.isValid, `${commandType} response should be valid: ${parsed.errors?.join("; ")}`);
  assert(parsed.crcStatus === "VALID", `${commandType} response CRC should be valid`);
  assert(parsed.command === commandType, `${commandType} response parsed as ${parsed.command}`);
}

console.log("control board protocol vectors ok");
