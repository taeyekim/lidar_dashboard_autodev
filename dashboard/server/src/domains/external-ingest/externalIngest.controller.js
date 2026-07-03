const externalIngestService = require("./externalIngest.service");

// Accept live LiDAR PC HTTP payloads and delegate normalization/storage to the service.
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

// Accept LiDAR mock payloads for local and rehearsal flows.
async function receiveLidarMock(req, res) {
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

// Accept control-board HTTP bridge diagnostics. Primary operator commands use TCP.
async function receiveControlBoard(req, res) {
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

// Accept control-board mock packet diagnostics.
async function receiveControlBoardMock(req, res) {
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

// Keep the legacy serial alias for older field test inputs without opening a serial port.
async function testControlBoardSerial(req, res) {
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

// Return recent ingest events for authenticated operator diagnostics.
function getRecentEvents(req, res) {
  const limit = Number(req.query.limit) || 20;
  res.json(externalIngestService.getRecentEvents(limit));
}

// Summarize recent ingest health for authenticated operator diagnostics.
function getIngestStatus(req, res) {
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
