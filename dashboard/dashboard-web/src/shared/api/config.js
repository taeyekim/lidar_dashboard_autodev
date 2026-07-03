const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

// Environment-driven endpoints for the API, WebSocket, and detector services.
const API_HOST = import.meta.env.VITE_API_HOST || "localhost";
const API_PORT = import.meta.env.VITE_API_PORT || "5000";
const DETECTOR_HOST = import.meta.env.VITE_DETECTOR_HOST || API_HOST;
const DETECTOR_PORT = import.meta.env.VITE_DETECTOR_PORT || "8888";
export const AUTH_CSRF_COOKIE_NAME = import.meta.env.VITE_AUTH_CSRF_COOKIE_NAME || "lidar_dashboard_csrf";

export const API_BASE = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || `http://${API_HOST}:${API_PORT}`,
);

export const WS_BASE = trimTrailingSlash(
  import.meta.env.VITE_WS_BASE_URL || `ws://${API_HOST}:${API_PORT}/ws`,
);

export const DETECTOR_BASE = trimTrailingSlash(
  import.meta.env.VITE_DETECTOR_BASE_URL || `http://${DETECTOR_HOST}:${DETECTOR_PORT}`,
);

// Joins base URLs and paths while removing duplicate or missing slashes.
export function joinUrl(baseUrl, path) {
  const normalizedPath = String(path || "");
  return `${trimTrailingSlash(baseUrl)}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

export function apiUrl(path) {
  return joinUrl(API_BASE, path);
}

export function detectorUrl(path) {
  return joinUrl(DETECTOR_BASE, path);
}
