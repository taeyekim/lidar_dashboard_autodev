import { getJson } from "../../shared/api/http";

function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function fetchTrafficStatistics(params = {}) {
  return getJson(`/api/statistics/traffic${buildQuery(params)}`);
}
