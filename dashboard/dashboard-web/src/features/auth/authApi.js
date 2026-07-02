import { getJson, postJson } from "../../shared/api/http";

export async function loginOperator(userId, password) {
  return postJson("/api/auth/login", { userId, password }, { skipAuth: true });
}

export async function fetchCurrentOperator() {
  return getJson("/api/auth/me");
}

export async function logoutOperator() {
  return postJson("/api/auth/logout", {});
}
