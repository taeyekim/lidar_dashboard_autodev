const DEFAULT_FIELD_BASE_URL = "http://localhost:8080";

function firstNonEmpty(values) {
  return values.find((value) => String(value || "").trim());
}

function resolveFieldBaseUrl(primary, ...fallbacks) {
  return firstNonEmpty([primary, process.env.FIELD_BASE_URL, ...fallbacks]) || DEFAULT_FIELD_BASE_URL;
}

module.exports = {
  DEFAULT_FIELD_BASE_URL,
  resolveFieldBaseUrl,
};
