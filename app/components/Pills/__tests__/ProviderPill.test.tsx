import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ProviderPill } from "../ProviderPill";

describe("ProviderPill", () => {
  test("renders the AWS label for aws", () => {
    render(<ProviderPill provider="aws" />);
    expect(screen.getByText("AWS S3")).toBeInTheDocument();
  });

  test("renders the RustFS label for rustfs", () => {
    render(<ProviderPill provider="rustfs" />);
    expect(screen.getByText("RustFS")).toBeInTheDocument();
  });

  test("matches the provider value case-insensitively", () => {
    render(<ProviderPill provider={"RustFS" as "rustfs"} />);
    expect(screen.getByText("RustFS")).toBeInTheDocument();
  });

  test("falls back to the AWS pill for an unknown provider value", () => {
    render(<ProviderPill provider={"minio" as "rustfs"} />);
    expect(screen.getByText("AWS S3")).toBeInTheDocument();
  });
});
