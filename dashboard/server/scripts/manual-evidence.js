const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..", "..");

const manualEvidenceDefinitions = [
  {
    type: "Operator UI Walkthrough",
    area: "Operator UI Walkthrough",
    path: "artifacts/manual/operator-ui-walkthrough.md",
    template: "docs/ops/operator-ui-walkthrough-template.md",
    required: true,
    requiredWhen: "Field acceptance requires browser walkthrough evidence.",
    notes:
      "Browser walkthrough evidence for login, dashboard, DRY_RUN/LIVE_TCP, liveApproved, LIVE_TCP_APPROVAL_REQUIRED, event detail, devices, realtime state, statistics, and Swagger.",
    nextAction:
      "Fill docs/ops/operator-ui-walkthrough-template.md after browser walkthrough and save the field copy to artifacts/manual/operator-ui-walkthrough.md.",
    doneWhen:
      "Operator UI walkthrough evidence is attached, has no TODO rows, and records '| Walkthrough result | PASS |'.",
  },
  {
    type: "Field Risk Acceptance",
    area: "Field Risk Acceptance",
    path: "artifacts/manual/field-risk-acceptance.md",
    template: "docs/ops/field-risk-acceptance-template.md",
    required: true,
    requiredWhen:
      "Field readiness, scanner, trusted-LAN, Swagger, HTTPS cookie, dry-run, or unavailable-hardware risk is accepted instead of resolved.",
    notes:
      "Reviewer decision for accepted trusted-LAN, scanner, Swagger, HTTPS cookie, dry-run, or unavailable-hardware risks.",
    nextAction:
      "Fill docs/ops/field-risk-acceptance-template.md for accepted trusted-LAN, scanner, Swagger, HTTPS cookie, dry-run, or unavailable-hardware risks.",
    doneWhen:
      "Accepted field risks record '| Decision | ACCEPTED |' plus compensating control, owner, and recheck date.",
  },
];

function validateManualEvidence(type, content) {
  if (type === "Operator UI Walkthrough") {
    const requiredTokens = [
      "## Required Screens",
      "Login",
      "Dashboard",
      "Control-board mode",
      "liveApproved",
      "LIVE_TCP_APPROVAL_REQUIRED",
      "Event detail",
      "Devices",
      "Event Log",
      "Statistics",
      "Swagger",
      "## Reviewer Decision",
      "Walkthrough result",
    ];
    const missingTokens = requiredTokens.filter((token) => !content.includes(token));
    if (missingTokens.length > 0) return `Missing required token(s): ${missingTokens.join(", ")}.`;
    if (/\|\s*TODO\s*\|/.test(content)) return "Evidence still contains TODO screen rows.";
    if (!/\|\s*Walkthrough result\s*\|\s*PASS\s*\|/.test(content)) {
      return "Evidence must record '| Walkthrough result | PASS |'.";
    }
  }

  if (type === "Field Risk Acceptance") {
    const requiredTokens = [
      "## Accepted Items",
      "Risk Accepted",
      "Compensating Control",
      "Evidence Reference",
      "Expiry Or Recheck",
      "## Reviewer Decision",
      "Decision",
      "Follow-up owner",
      "Target recheck date",
      "Reviewer signature/name",
    ];
    const missingTokens = requiredTokens.filter((token) => !content.includes(token));
    if (missingTokens.length > 0) return `Missing required token(s): ${missingTokens.join(", ")}.`;
    if (/\|\s*TODO\s*\|/.test(content)) return "Evidence still contains TODO accepted-item rows.";
    if (/\|\s*Decision\s*\|\s*RECHECK_REQUIRED\s*\|/.test(content)) {
      return "Evidence decision is RECHECK_REQUIRED; close the recheck or keep the risk evidence invalid before final completion.";
    }
    if (!/\|\s*Decision\s*\|\s*ACCEPTED\s*\|/.test(content)) {
      return "Evidence must record a reviewer decision of ACCEPTED.";
    }
    const emptyField = ["Follow-up owner", "Target recheck date", "Reviewer signature/name"].find((field) => {
      const pattern = new RegExp(`\\|\\s*${field}\\s*\\|\\s*\\|`);
      return pattern.test(content);
    });
    if (emptyField) return `Evidence has an empty '${emptyField}' value.`;
  }

  return "";
}

function manualEvidenceRefs() {
  return manualEvidenceDefinitions.map((item) => {
    const absolutePath = path.join(root, item.path);
    if (!fs.existsSync(absolutePath)) {
      return { ...item, status: "MISSING", validationReason: "Evidence file does not exist." };
    }
    const content = fs.readFileSync(absolutePath, "utf8");
    const validationReason = validateManualEvidence(item.type, content);
    return {
      ...item,
      status: validationReason ? "INVALID" : "PRESENT",
      validationReason,
    };
  });
}

module.exports = {
  manualEvidenceDefinitions,
  manualEvidenceRefs,
  validateManualEvidence,
};
