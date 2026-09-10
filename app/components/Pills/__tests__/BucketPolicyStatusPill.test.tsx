import { render, screen } from "@testing-library/react";

import { BucketPolicyStatusPill } from "../BucketPolicyStatusPill";

describe("BucketPolicyStatusPill", () => {
  test.each([
    ["none", "No policy"],
    ["applied", "Applied"],
    ["drifted", "Drifted"],
    ["error", "Error"],
    ["externally_managed", "Managed externally"],
  ] as const)("renders %s as %s", (status, label) => {
    render(<BucketPolicyStatusPill status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});
