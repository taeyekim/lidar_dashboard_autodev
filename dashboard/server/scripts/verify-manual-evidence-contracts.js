const fs = require("fs");
const path = require("path");

const {
  manualEvidenceDefinitions,
  manualEvidenceRefs,
  validateManualEvidence,
} = require("./manual-evidence");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", relativePath), "utf8");
}

function assertIncludes(content, token, label) {
  assert(content.includes(token), `${label} is missing ${token}`);
}

const rootPackageJson = readProjectFile("package.json");
const serverPackageJson = readProjectFile("dashboard/server/package.json");
const deliveryEvidence = readProjectFile("dashboard/server/scripts/generate-delivery-evidence.js");
const completionAudit = readProjectFile("dashboard/server/scripts/generate-completion-audit.js");
const handoverIndex = readProjectFile("dashboard/server/scripts/generate-handover-index.js");
const handoverPackage = readProjectFile("dashboard/server/scripts/generate-handover-package.js");
const fieldClosurePlan = readProjectFile("dashboard/server/scripts/generate-field-closure-plan.js");
const operatorTemplate = readProjectFile("docs/ops/operator-ui-walkthrough-template.md");
const riskTemplate = readProjectFile("docs/ops/field-risk-acceptance-template.md");

assert(manualEvidenceDefinitions.length === 2, "manual evidence definitions should cover two required artifacts");

[
  "Operator UI Walkthrough",
  "Field Risk Acceptance",
  "artifacts/manual/operator-ui-walkthrough.md",
  "artifacts/manual/field-risk-acceptance.md",
  "docs/ops/operator-ui-walkthrough-template.md",
  "docs/ops/field-risk-acceptance-template.md",
].forEach((token) => {
  assert(
    manualEvidenceDefinitions.some((item) =>
      Object.values(item).some((value) => String(value).includes(token)),
    ),
    `manual evidence definitions are missing ${token}`,
  );
});

const operatorTemplateReason = validateManualEvidence("Operator UI Walkthrough", operatorTemplate);
assert(
  operatorTemplateReason.includes("Site name"),
  "operator UI template should remain invalid until session values are completed",
);

const validOperatorEvidence = operatorTemplate
  .replace(/\| TODO \|/g, "| PASS |")
  .replace("| Site name |  |", "| Site name | delivery-site |")
  .replace("| Reviewer |  |", "| Reviewer | reviewer |")
  .replace("| Operator account |  |", "| Operator account | operator@example.local |")
  .replace("| Browser and version |  |", "| Browser and version | Chrome 126 |")
  .replace("| Delivery display resolution |  |", "| Delivery display resolution | 1920x1080 |")
  .replace("| Entry URL |  |", "| Entry URL | https://dashboard.example.local |")
  .replace("| Base API URL |  |", "| Base API URL | https://dashboard.example.local/api |")
  .replace("| Captured at |  |", "| Captured at | 2026-07-03T00:00:00Z |")
  .replace("| Screenshot |  |  |", "| Screenshot | artifacts/manual/screenshots/operator-ui-dashboard.png | Dashboard, event detail, devices, statistics, and Swagger captures. |")
  .replace("| Walkthrough result | PASS / REVIEW |", "| Walkthrough result | PASS |")
  .replace("| Reviewer signature/name |  |", "| Reviewer signature/name | reviewer |")
  .replace("| Decision timestamp |  |", "| Decision timestamp | 2026-07-03T00:00:00Z |");
assert(validateManualEvidence("Operator UI Walkthrough", validOperatorEvidence) === "", "valid operator evidence should pass");

const sessionOnlyOperatorEvidence = validOperatorEvidence
  .replace(/\| PASS \|/g, "| TODO |")
  .replace("| Walkthrough result | PASS |", "| Walkthrough result | PASS / REVIEW |");
assert(
  validateManualEvidence("Operator UI Walkthrough", sessionOnlyOperatorEvidence).includes("TODO screen rows"),
  "operator UI evidence should remain invalid until walkthrough rows are completed",
);

const missingSessionOperatorEvidence = validOperatorEvidence.replace(
  "| Delivery display resolution | 1920x1080 |",
  "| Delivery display resolution |  |",
);
assert(
  validateManualEvidence("Operator UI Walkthrough", missingSessionOperatorEvidence).includes("Delivery display resolution"),
  "operator evidence must reject empty delivery display resolution",
);

const missingEvidenceReferenceOperatorEvidence = validOperatorEvidence.replace(
  "| Screenshot | artifacts/manual/screenshots/operator-ui-dashboard.png | Dashboard, event detail, devices, statistics, and Swagger captures. |",
  "| Screenshot |  | Dashboard, event detail, devices, statistics, and Swagger captures. |",
);
assert(
  validateManualEvidence("Operator UI Walkthrough", missingEvidenceReferenceOperatorEvidence).includes("at least one screenshot"),
  "operator evidence must reject PASS walkthroughs without screenshot or artifact references",
);

const placeholderSessionOperatorEvidence = validOperatorEvidence.replace(
  "| Site name | delivery-site |",
  "| Site name | TBD |",
);
assert(
  validateManualEvidence("Operator UI Walkthrough", placeholderSessionOperatorEvidence).includes("placeholder 'Site name'"),
  "operator evidence must reject placeholder session values",
);

const placeholderDecisionOperatorEvidence = validOperatorEvidence.replace(
  "| Reviewer signature/name | reviewer |",
  "| Reviewer signature/name | pending |",
);
assert(
  validateManualEvidence("Operator UI Walkthrough", placeholderDecisionOperatorEvidence).includes("placeholder 'Reviewer signature/name'"),
  "operator evidence must reject placeholder decision values",
);

const placeholderEvidenceReferenceOperatorEvidence = validOperatorEvidence.replace(
  "| Screenshot | artifacts/manual/screenshots/operator-ui-dashboard.png | Dashboard, event detail, devices, statistics, and Swagger captures. |",
  "| Screenshot | N/A | Dashboard, event detail, devices, statistics, and Swagger captures. |",
);
assert(
  validateManualEvidence("Operator UI Walkthrough", placeholderEvidenceReferenceOperatorEvidence).includes("placeholder path or reference"),
  "operator evidence must reject placeholder screenshot or artifact references",
);

[
  "liveApproved",
  "LIVE_TCP_APPROVAL_REQUIRED",
  "At least one `Evidence Files` path or reference",
  "Placeholder values",
].forEach((token) => assertIncludes(operatorTemplate, token, "operator UI walkthrough template"));

const riskTemplateReason = validateManualEvidence("Field Risk Acceptance", riskTemplate);
assert(
  riskTemplateReason.includes("Site name"),
  "risk acceptance template should remain invalid until session values are completed",
);

const validRiskEvidence = `
## Session
| Item | Value |
| --- | --- |
| Site name | delivery-site |
| Reviewer | reviewer |
| Operator | operator@example.local |
| Delivery host | delivery-host-01 |
| Base URL | https://dashboard.example.local |
| Acceptance date | 2026-08-01 |

## Accepted Items
| Status | Area | Risk Accepted | Compensating Control | Evidence Reference | Expiry Or Recheck |
| --- | --- | --- | --- | --- | --- |
| ACCEPTED | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. | artifacts/security/example/manifest.json | 2026-08-01 |

## Reviewer Decision
| Item | Value |
| --- | --- |
| Decision | ACCEPTED |
| Required follow-up | Install approved scanner package and rerun security evidence. |
| Follow-up owner | field-owner |
| Target recheck date | 2026-08-01 |
| Reviewer signature/name | reviewer |
`;
assert(validateManualEvidence("Field Risk Acceptance", validRiskEvidence) === "", "valid risk acceptance evidence should pass");

const sessionOnlyRiskEvidence = validRiskEvidence.replace(
  "| ACCEPTED | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. | artifacts/security/example/manifest.json | 2026-08-01 |",
  "| TODO | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. | artifacts/security/example/manifest.json | 2026-08-01 |",
);
assert(
  validateManualEvidence("Field Risk Acceptance", sessionOnlyRiskEvidence).includes("TODO accepted-item rows"),
  "risk acceptance evidence should remain invalid until accepted-item rows are completed",
);

const missingEvidenceRisk = validRiskEvidence.replace(
  "| ACCEPTED | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. | artifacts/security/example/manifest.json | 2026-08-01 |",
  "| ACCEPTED | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. |  | 2026-08-01 |",
);
assert(
  validateManualEvidence("Field Risk Acceptance", missingEvidenceRisk).includes("Accepted risk item rows"),
  "risk acceptance evidence must reject accepted rows without evidence reference",
);

const placeholderRiskEvidence = validRiskEvidence.replace(
  "| ACCEPTED | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. | artifacts/security/example/manifest.json | 2026-08-01 |",
  "| ACCEPTED | Security scanners | ZAP skipped on field PC. | Internal-only network and audit policy evidence. | TBD | 2026-08-01 |",
);
assert(
  validateManualEvidence("Field Risk Acceptance", placeholderRiskEvidence).includes("placeholder values"),
  "risk acceptance evidence must reject placeholder evidence references",
);

const placeholderFollowUpRiskEvidence = validRiskEvidence.replace("| Follow-up owner | field-owner |", "| Follow-up owner | TBD |");
assert(
  validateManualEvidence("Field Risk Acceptance", placeholderFollowUpRiskEvidence).includes("placeholder 'Follow-up owner'"),
  "risk acceptance evidence must reject placeholder reviewer follow-up values",
);

const recheckRiskEvidence = validRiskEvidence.replace("| Decision | ACCEPTED |", "| Decision | RECHECK_REQUIRED |");
assert(
  validateManualEvidence("Field Risk Acceptance", recheckRiskEvidence).includes("RECHECK_REQUIRED"),
  "risk acceptance evidence must stay invalid while reviewer decision is RECHECK_REQUIRED",
);

assertIncludes(riskTemplate, "Placeholder values", "field risk acceptance template");

const manualEvidence = manualEvidenceRefs();
assert(manualEvidence.length === manualEvidenceDefinitions.length, "manual evidence refs should mirror definitions");
manualEvidence.forEach((item) => {
  assert(["PRESENT", "MISSING", "INVALID"].includes(item.status), `unexpected manual evidence status: ${item.status}`);
  if (item.status !== "PRESENT") {
    assert(item.validationReason, `${item.type} should expose validationReason when not PRESENT`);
  }
});

[
  [deliveryEvidence, "manualEvidenceRefs", "delivery evidence generator"],
  [completionAudit, "manualEvidenceRefs", "completion audit generator"],
  [handoverIndex, "manualEvidenceRefs", "handover index generator"],
  [handoverPackage, "manualEvidenceRefs", "handover package generator"],
  [fieldClosurePlan, "manualEvidenceRefs", "field closure plan generator"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

[
  [rootPackageJson, "verify:manual-evidence", "root package scripts"],
  [rootPackageJson, "verify-manual-evidence-contracts.js", "root package scripts"],
  [serverPackageJson, "verify-manual-evidence-contracts.js", "server package verify chain"],
].forEach(([content, token, label]) => assertIncludes(content, token, label));

console.log("manual evidence contracts ok");
