const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

function createRateLimiter({ windowMs, max, keyPrefix = "rate" }) {
  const buckets = new Map();

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${keyPrefix}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        ok: false,
        error: "Too many requests. Please retry later.",
      });
    }

    return next();
  };
}

function onlyMutations(limiter) {
  return function mutationLimiter(req, res, next) {
    if (!req.path.startsWith("/api/") || !MUTATION_METHODS.has(req.method)) {
      return next();
    }
    return limiter(req, res, next);
  };
}

function requireJsonForMutations(req, res, next) {
  if (
    req.path.startsWith("/api/") &&
    MUTATION_METHODS.has(req.method) &&
    req.is("application/json") === false
  ) {
    return res.status(415).json({
      ok: false,
      error: "Content-Type application/json is required.",
    });
  }
  return next();
}

module.exports = {
  createRateLimiter,
  onlyMutations,
  requireJsonForMutations,
  securityHeaders,
};
