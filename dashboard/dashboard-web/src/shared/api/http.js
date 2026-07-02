import { apiUrl } from "./config";

const TOKEN_STORAGE_KEY = "lidar_dashboard_auth_token";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function authHeaders(options = {}) {
  const token = options.skipAuth ? null : getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function buildRequestOptions(options = {}, headers = {}) {
  const rest = { ...options };
  delete rest.skipAuth;
  delete rest.headers;
  return {
    ...rest,
    headers,
  };
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

// 백엔드 GET JSON 요청 공통 함수이다. 추후 인증 헤더가 필요하면 이 파일에서 함께 처리한다.
export async function getJson(path, options = {}) {
  const response = await fetch(
    apiUrl(path),
    buildRequestOptions({ cache: "no-store", ...options }, {
      ...authHeaders(options),
      ...(options.headers || {}),
    }),
  );
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(data.error || data.message || `GET ${path} failed`);
  }

  return data;
}

// 백엔드 POST JSON 요청 공통 함수이다. Content-Type과 에러 처리를 한 곳에서 관리한다.
export async function postJson(path, body = {}, options = {}) {
  const response = await fetch(
    apiUrl(path),
    buildRequestOptions(
      {
        ...options,
        method: "POST",
        body: JSON.stringify(body),
      },
      {
        "Content-Type": "application/json",
        ...authHeaders(options),
        ...(options.headers || {}),
      },
    ),
  );
  const data = await parseJson(response);

  if (!response.ok || data.ok === false || data.success === false) {
    throw new Error(data.error || data.message || `POST ${path} failed`);
  }

  return data;
}

export async function patchJson(path, body = {}, options = {}) {
  const response = await fetch(
    apiUrl(path),
    buildRequestOptions(
      {
        ...options,
        method: "PATCH",
        body: JSON.stringify(body),
      },
      {
        "Content-Type": "application/json",
        ...authHeaders(options),
        ...(options.headers || {}),
      },
    ),
  );
  const data = await parseJson(response);

  if (!response.ok || data.ok === false || data.success === false) {
    throw new Error(data.error || data.message || `PATCH ${path} failed`);
  }

  return data;
}
