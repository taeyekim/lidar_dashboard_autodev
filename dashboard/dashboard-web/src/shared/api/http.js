import { AUTH_CSRF_COOKIE_NAME, apiUrl } from "./config";

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return "";
  return decodeURIComponent(cookie.slice(prefix.length));
}

function buildCsrfHeaders(options = {}) {
  if (options.skipCsrf) return {};
  const token = readCookie(AUTH_CSRF_COOKIE_NAME);
  return token ? { "X-CSRF-Token": token } : {};
}

function buildRequestOptions(options = {}, headers = {}) {
  const rest = { ...options };
  delete rest.skipAuth;
  delete rest.skipCsrf;
  delete rest.headers;
  return {
    credentials: "include",
    ...rest,
    headers,
  };
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

// Shared GET helper for cookie-authenticated dashboard API requests.
export async function getJson(path, options = {}) {
  const response = await fetch(
    apiUrl(path),
    buildRequestOptions({ cache: "no-store", ...options }, {
      ...(options.headers || {}),
    }),
  );
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(data.error || data.message || `GET ${path} failed`);
  }

  return data;
}

// Shared POST helper for JSON mutation requests with CSRF protection.
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
        ...buildCsrfHeaders(options),
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
        ...buildCsrfHeaders(options),
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
