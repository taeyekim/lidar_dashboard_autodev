import { getJson } from "../../shared/api/http";
import { unwrapApiData } from "../events/eventsApi";

function toArray(response) {
  const data = unwrapApiData(response, []);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export async function fetchDevices() {
  return toArray(await getJson("/api/devices"));
}

export async function fetchDeviceStatus() {
  return unwrapApiData(await getJson("/api/devices/status"), {});
}

export async function fetchSystemStatus() {
  return unwrapApiData(await getJson("/api/status"), {});
}

export function normalizeDevice(device = {}) {
  const zone = device.zone || {};
  const site = zone.site || {};
  const latestStatusLog = device.latestStatusLog || null;

  return {
    id: device.id || device.deviceCode || device.name || "",
    code: device.deviceCode || "-",
    name: device.name || device.deviceCode || "Unnamed device",
    type: device.deviceType || "UNKNOWN",
    status: device.status || "UNKNOWN",
    healthStatus: device.healthStatus || "UNKNOWN",
    ipAddress: device.ipAddress || "-",
    port: device.port || null,
    location: device.installedLocation || zone.name || site.name || "-",
    zoneName: zone.name || "-",
    siteName: site.name || "-",
    lastSeenAt: device.lastSeenAt || latestStatusLog?.createdAt || null,
    latestMessage: latestStatusLog?.message || "",
    raw: device,
  };
}

export function normalizeDevices(devices = []) {
  return devices.map((device) => normalizeDevice(device));
}
