import { getJson, postJson } from "../../shared/api/http";

export async function fetchControlBoardStatus() {
  return getJson("/api/control-board/status");
}

export async function fetchControlBoardCommands(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return getJson(`/api/control-board/commands${query ? `?${query}` : ""}`);
}

export async function sendControlBoardTestCommand(commandType) {
  const response = await postJson("/api/control-board/commands/test", { commandType });
  return response.command || response;
}

export function controlBoardModeLabel(status = {}) {
  if (!status.ok) return "OFFLINE";
  return status.mode || "UNKNOWN";
}

export function latestCommandSummary(command = null) {
  if (!command) return "No command history";
  const parts = [command.commandType, command.status].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Latest command";
}
