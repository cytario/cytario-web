// AWS caps the inline `Policy` parameter of `AssumeRoleWithWebIdentity` at 2048
// characters. Each session-policy generator serializes its own document but
// shares this ceiling and error so an over-limit policy fails closed here with a
// connection-level cause, never as an opaque STS rejection.

/** AWS `AssumeRoleWithWebIdentity` `Policy` parameter ceiling (characters). */
export const POLICY_SIZE_CEILING = 2048;

/** Thrown when a serialized session policy exceeds the AWS `Policy` parameter ceiling. */
export class InlinePolicySizeError extends Error {
  readonly actualLength: number;
  readonly ceiling: number;

  constructor(actualLength: number, ceiling: number) {
    super(
      `Inline session policy size ceiling exceeded: serialized policy is ${actualLength} characters, ceiling is ${ceiling}.`,
    );
    this.name = "InlinePolicySizeError";
    this.actualLength = actualLength;
    this.ceiling = ceiling;
  }
}
