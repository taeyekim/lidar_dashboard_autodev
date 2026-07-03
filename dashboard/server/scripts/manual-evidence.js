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

function markdownTableValue(content, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\|\\s*${escaped}\\s*\\|\\s*([^|\\r\\n]+?)\\s*\\|`);
  const match = content.match(pattern);
  return match ? match[1].trim() : "";
}

function firstEmptyMarkdownField(content, fields) {
  return fields.find((field) => markdownTableValue(content, field) === "");
}

function markdownRowsAfterHeader(content, headerToken) {
  const lines = content.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.includes(headerToken));
  if (headerIndex === -1) return [];
  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("|")) break;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function isPlaceholderMarkdownCell(value) {
  return /^(?:-|n\/a|na|none|null|tbd|todo|pending|unknown)$/i.test(String(value || "").trim());
}

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
    const emptySessionField = firstEmptyMarkdownField(content, [
      "Site name",
      "Reviewer",
      "Operator account",
      "Browser and version",
      "Delivery display resolution",
      "Entry URL",
      "Base API URL",
      "Captured at",
    ]);
    if (emptySessionField) return `Evidence has an empty '${emptySessionField}' session value.`;
    if (/\|\s*TODO\s*\|/.test(content)) return "Evidence still contains TODO screen rows.";
    if (!/\|\s*Walkthrough result\s*\|\s*PASS\s*\|/.test(content)) {
      return "Evidence must record '| Walkthrough result | PASS |'.";
    }
    const emptyDecisionField = firstEmptyMarkdownField(content, [
      "Reviewer signature/name",
      "Decision timestamp",
    ]);
    if (emptyDecisionField) return `Evidence has an empty '${emptyDecisionField}' decision value.`;
    const evidenceRows = markdownRowsAfterHeader(content, "Path Or Reference");
    const filledEvidenceRows = evidenceRows.filter((row) => row[1] && row[1].trim() !== "");
    if (filledEvidenceRows.length === 0) {
      return "Evidence must include at least one screenshot, browser note, field acceptance manifest, or handover package reference.";
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
    const emptySessionField = firstEmptyMarkdownField(content, [
      "Site name",
      "Reviewer",
      "Operator",
      "Delivery host",
      "Base URL",
      "Acceptance date",
    ]);
    if (emptySessionField) return `Evidence has an empty '${emptySessionField}' session value.`;
    if (/\|\s*TODO\s*\|/.test(content)) return "Evidence still contains TODO accepted-item rows.";
    const acceptedRows = markdownRowsAfterHeader(content, "Risk Accepted").filter((row) => row[0] === "ACCEPTED");
    if (acceptedRows.length === 0) return "Evidence must include at least one ACCEPTED risk item row.";
    const emptyAcceptedCell = acceptedRows.find((row) => row.slice(1, 6).some((cell) => cell === ""));
    if (emptyAcceptedCell) {
      return "Accepted risk item rows must include area, risk, compensating control, evidence reference, and expiry/recheck.";
    }
    const placeholderAcceptedCell = acceptedRows.find((row) => row.slice(1, 6).some(isPlaceholderMarkdownCell));
    if (placeholderAcceptedCell) {
      return "Accepted risk item rows must not use placeholder values such as TBD, N/A, none, pending, or unknown.";
    }
    if (/\|\s*Decision\s*\|\s*RECHECK_REQUIRED\s*\|/.test(content)) {
      return "Evidence decision is RECHECK_REQUIRED; close the recheck or keep the risk evidence invalid before final completion.";
    }
    if (!/\|\s*Decision\s*\|\s*ACCEPTED\s*\|/.test(content)) {
      return "Evidence must record a reviewer decision of ACCEPTED.";
    }
    const emptyField = firstEmptyMarkdownField(content, [
      "Required follow-up",
      "Follow-up owner",
      "Target recheck date",
      "Reviewer signature/name",
    ]);
    if (emptyField) return `Evidence has an empty '${emptyField}' value.`;
    const placeholderDecisionField = [
      "Required follow-up",
      "Follow-up owner",
      "Target recheck date",
      "Reviewer signature/name",
    ].find((field) => isPlaceholderMarkdownCell(markdownTableValue(content, field)));
    if (placeholderDecisionField) return `Evidence has a placeholder '${placeholderDecisionField}' value.`;
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
  firstEmptyMarkdownField,
  isPlaceholderMarkdownCell,
  markdownRowsAfterHeader,
  manualEvidenceDefinitions,
  manualEvidenceRefs,
  markdownTableValue,
  validateManualEvidence,
};
