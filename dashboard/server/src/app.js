const express = require("express");
const cors = require("cors");
const path = require("path");
const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./swagger");
const apiRoutes = require("./routes");
const { config } = require("./config");
const {
  createRateLimiter,
  onlyMutations,
  requireJsonForMutations,
  securityHeaders,
} = require("./middleware/security");

const app = express();

app.set("trust proxy", config.trustProxy);

app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));
app.use(requireJsonForMutations);
app.use(express.json({ limit: config.jsonBodyLimit }));
app.use("/api/auth/login", createRateLimiter({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  keyPrefix: "auth-login",
}));
app.use(onlyMutations(createRateLimiter({
  windowMs: config.mutationRateLimitWindowMs,
  max: config.mutationRateLimitMax,
  keyPrefix: "api-mutation",
})));

app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(express.static(config.distPath));

app.use("/api", apiRoutes);

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(config.distPath, "index.html"));
});

module.exports = { app };
