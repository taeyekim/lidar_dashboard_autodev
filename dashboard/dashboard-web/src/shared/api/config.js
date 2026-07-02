const trimTrailingSlash = (value) => String(value || "").replace(/\/+$/, "");

// 프론트에서 사용하는 백엔드, WebSocket, 감지 서버 주소를 환경변수 기준으로 관리한다.
const API_HOST = import.meta.env.VITE_API_HOST || "localhost";
const API_PORT = import.meta.env.VITE_API_PORT || "5000";
const DETECTOR_HOST = import.meta.env.VITE_DETECTOR_HOST || API_HOST;
const DETECTOR_PORT = import.meta.env.VITE_DETECTOR_PORT || "8888";

export const API_BASE = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || `http://${API_HOST}:${API_PORT}`,
);

export const WS_BASE = trimTrailingSlash(
  import.meta.env.VITE_WS_BASE_URL || `ws://${API_HOST}:${API_PORT}/ws`,
);

export const DETECTOR_BASE = trimTrailingSlash(
  import.meta.env.VITE_DETECTOR_BASE_URL || `http://${DETECTOR_HOST}:${DETECTOR_PORT}`,
);

// baseUrl 끝과 path 앞의 슬래시 중복/누락을 정리해 안전한 URL을 만든다.
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
