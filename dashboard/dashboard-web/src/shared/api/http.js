import { apiUrl } from "./config";

function buildRequestOptions(options = {}, headers = {}) {
  const rest = { ...options };
  delete rest.skipAuth;
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

// 백엔드 GET JSON 요청 공통 함수이다. 추후 인증 헤더가 필요하면 이 파일에서 함께 처리한다.
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
