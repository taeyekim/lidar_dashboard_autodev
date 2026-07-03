function responseDurationMs(command) {
  if (!command?.sentAt || !command?.acknowledgedAt) return null;
  const sentAtMs = new Date(command.sentAt).getTime();
  const acknowledgedAtMs = new Date(command.acknowledgedAt).getTime();
  const durationMs = acknowledgedAtMs - sentAtMs;
  return durationMs >= 0 ? durationMs : null;
}

function summarizeResponseLatency(commands = []) {
  const durations = commands.map(responseDurationMs).filter((duration) => duration !== null);
  return {
    averageResponseMs: durations.length
      ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
      : null,
    responseSampleCount: durations.length,
  };
}

module.exports = {
  responseDurationMs,
  summarizeResponseLatency,
};
