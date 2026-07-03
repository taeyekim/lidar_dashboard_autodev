const externalIngestService = require("./externalIngest.service");

// 실제 라이다 PC HTTP 요청을 받아 service로 넘기고 수신 결과를 응답한다.
async function receiveLidar(req, res) {
  try {
    const result = await externalIngestService.ingestLidarLive(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Failed to ingest lidar payload.",
    });
  }
}

// 라이다 mock HTTP 요청을 받아 service로 넘기고 수신 결과를 응답한다.
async function receiveLidarMock(req, res) {
  // controller는 HTTP 요청/응답만 담당하고, 실제 변환과 화면 반영은 service에 맡긴다.
  try {
    const result = await externalIngestService.ingestLidarMock(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Failed to ingest lidar mock payload.",
    });
  }
}

// 통합 제어보드 실제 HTTP ingest 요청을 받아 service로 넘긴다.
async function receiveControlBoard(req, res) {
  // RS-485 장비가 직접 HTTP를 호출하지 않더라도, 브릿지/테스트 프로그램이 같은 진입점을 사용할 수 있게 둔다.
  try {
    const event = await externalIngestService.ingestControlBoardLive(req.body || {});
    res.json({ ok: true, eventId: event.id, receivedAt: event.receivedAt, event });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Failed to ingest control board payload.",
    });
  }
}

// 통합 제어보드 mock packet 요청을 받아 service로 넘기고 수신 결과를 응답한다.
async function receiveControlBoardMock(req, res) {
  // 통합 제어보드 mock 요청도 service로 넘겨 내부 이벤트 변환 흐름을 동일하게 탄다.
  try {
    const event = await externalIngestService.ingestControlBoardMock(req.body || {});
    res.json({ ok: true, eventId: event.id, receivedAt: event.receivedAt, event });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Failed to ingest control board mock payload.",
    });
  }
}

// serial reader 테스트 요청을 받아 실제 포트 연결 전 입력 형태와 변환 흐름을 확인한다.
async function testControlBoardSerial(req, res) {
  // 실제 serialport 연결 없이 현장 입력값과 samplePacket 처리 흐름만 확인하는 테스트 엔드포인트다.
  try {
    const result = await externalIngestService.createSerialTest(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Failed to test control board serial input.",
    });
  }
}

async function testControlBoardTcp(req, res) {
  try {
    const result = await externalIngestService.createTcpFrameTest(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.status ? error.message : "Failed to test control board TCP frame input.",
    });
  }
}

// 최근 외부 수신 이벤트 목록을 반환한다.
function getRecentEvents(req, res) {
  // 최근 수신 이벤트 조회는 현장 테스트 중 수신 여부를 빠르게 확인하기 위한 임시 조회 기능이다.
  const limit = Number(req.query.limit) || 20;
  res.json(externalIngestService.getRecentEvents(limit));
}

// 최근 외부 장비 수신 상태를 현장 점검용으로 요약해서 반환한다.
function getIngestStatus(req, res) {
  // 원시 이벤트 목록 전체를 보지 않아도 마지막 수신/CRC 오류 여부를 빠르게 확인하기 위한 API다.
  res.json(externalIngestService.getIngestStatus());
}

module.exports = {
  receiveLidar,
  receiveLidarMock,
  receiveControlBoard,
  receiveControlBoardMock,
  testControlBoardTcp,
  testControlBoardSerial,
  getRecentEvents,
  getIngestStatus,
};
