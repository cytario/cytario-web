import { findConditionKey } from "@cloud-copilot/iam-data";
import { expandIamActions, matchesAnyAction } from "@cloud-copilot/iam-expand";
import {
  lintPolicy,
  lintResourcePolicy,
  validateIdentityPolicy,
  validateResourcePolicy,
} from "@cloud-copilot/iam-policy";
import { runSimulation, type EvaluationResult, type Simulation } from "@cloud-copilot/iam-simulate";

/**
 * Thin adapters over `@cloud-copilot/*` for the generated-policy contract tests.
 *
 * The IAM data package is action/condition-key data loaded lazily from disk and
 * keyed by service, so every lookup is async and throws on an unknown *service*
 * (rather than returning false); the wrappers here normalise that. Everything is
 * cached by the package after first use.
 */

export interface PolicyStatement {
  Sid?: string;
  Effect?: string;
  Action?: string | string[];
  NotAction?: string | string[];
  Resource?: string | string[];
  NotResource?: string | string[];
  Principal?: unknown;
  Condition?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface PolicyDocument {
  Version?: string;
  Statement: PolicyStatement[];
}

const asArray = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as string[]) : [String(value)];
};

/** Every Action / NotAction string named by a statement, unexpanded. */
export const rawActions = (statement: PolicyStatement): string[] => [
  ...asArray(statement.Action),
  ...asArray(statement.NotAction),
];

/** Every Action / NotAction string a document names, unexpanded. */
export const allRawActions = (policy: PolicyDocument): string[] =>
  policy.Statement.flatMap(rawActions);

/** Every condition key named anywhere in a document (condition operators aside). */
export const allConditionKeys = (policy: PolicyDocument): string[] =>
  policy.Statement.flatMap((statement) =>
    Object.values(statement.Condition ?? {}).flatMap((block) => Object.keys(block)),
  );

/** The statement carrying the given Sid, or undefined. */
export const statementBySid = (policy: PolicyDocument, sid: string): PolicyStatement | undefined =>
  policy.Statement.find((statement) => statement.Sid === sid);

/**
 * Expand an action pattern (`s3:*`) into the concrete actions AWS publishes,
 * lower-cased so assertions are case-insensitive. Unknown *literal* actions are
 * dropped by the library's default; action existence is checked separately via
 * {@link actionIsKnown}.
 */
export const expandActions = async (actions: string | string[]): Promise<string[]> => {
  const expanded = await expandIamActions(actions);
  return expanded.map((action) => action.toLowerCase());
};

/** True when the action string names at least one real AWS action (wildcards allowed). */
export const actionIsKnown = (action: string): Promise<boolean> => matchesAnyAction(action);

/** True when the condition key is a known AWS key (global, service, or variable). */
export const conditionKeyIsKnown = async (key: string): Promise<boolean> => {
  try {
    return (await findConditionKey(key)) !== undefined;
  } catch {
    return false;
  }
};

/** Validation errors for a generated identity (inline session/role) policy. */
export const identityPolicyErrors = (policy: PolicyDocument) => validateIdentityPolicy(policy);

/** Validation errors for a generated resource (bucket) policy. */
export const resourcePolicyErrors = (policy: PolicyDocument) => validateResourcePolicy(policy);

/** Lint findings for an arbitrary generated policy document. */
export const lintErrors = (policy: PolicyDocument) => lintPolicy(policy);

/** Lint findings for a generated resource policy (adds the missing-Principal check). */
export const lintResourceErrors = (policy: PolicyDocument) => lintResourcePolicy(policy);

export const parsePolicy = (serialized: string): PolicyDocument =>
  JSON.parse(serialized) as PolicyDocument;

export interface SimulationSummary {
  overallResult: EvaluationResult;
  identityResult: EvaluationResult | undefined;
  ignoredContextKeys: string[];
}

/**
 * Evaluate one inline allowlist policy against one request.
 *
 * Session policies grant by allowlist only (no Deny statements), so the useful
 * distinction is whether the request is `Allowed` at all: an action the session
 * does not name is `ImplicitlyDenied`, which is how the "read-only session
 * cannot write" boundary is enforced at the STS layer.
 */
export const simulateIdentityPolicy = async (input: {
  policy: PolicyDocument;
  action: string;
  resource: string;
  principal?: string;
  contextVariables?: Record<string, string | string[]>;
}): Promise<SimulationSummary> => {
  const simulation: Simulation = {
    request: {
      principal: input.principal ?? "arn:aws:iam::123456789012:role/cytario/provider-roles/lab-rw",
      action: input.action,
      resource: { resource: input.resource, accountId: "123456789012" },
      contextVariables: input.contextVariables ?? {},
    },
    identityPolicies: [{ name: "SessionPolicy", policy: input.policy }],
    serviceControlPolicies: [],
    resourceControlPolicies: [],
  };

  const result = await runSimulation(simulation, {});
  if (result.resultType === "error") {
    throw new Error(`simulation failed: ${result.errors.message}`);
  }

  const analysis =
    result.resultType === "single" ? result.result.analysis : result.results[0]?.analysis;
  const ignored =
    result.resultType === "single"
      ? (result.result.ignoredContextKeys ?? [])
      : (result.results[0]?.ignoredContextKeys ?? []);

  return {
    overallResult: result.overallResult,
    identityResult: analysis?.identityAnalysis?.result,
    ignoredContextKeys: ignored,
  };
};
