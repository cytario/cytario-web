import { render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ConnectionForm } from "../connection.form";

const mockSubmit = vi.fn();
let mockActionData: unknown = undefined;

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useSubmit: () => mockSubmit,
    useActionData: () => mockActionData,
    useNavigation: () => ({ state: "idle" }),
  };
});

const catalog = {
  providerConnections: [
    {
      id: "pc-1",
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      status: "connected",
    },
  ],
  providerRoles: [
    {
      id: "pr-1",
      providerConnectionId: "pc-1",
      roleArn: "arn:aws:iam::123456789012:role/reader",
      name: "Reader",
      allowedScopes: ["lab"],
      allowsSharing: false,
    },
  ],
};

beforeEach(() => {
  mockActionData = undefined;
  mockSubmit.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ catalog }) }) as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderForm(adminScopes: string[] = []) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <ConnectionForm adminScopes={adminScopes} userId="test-user-id" />,
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("ConnectionForm — FK selectors (SRS-CY-32118)", () => {
  test("renders the provider selectors, not free-text role/endpoint inputs", async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Provider connection/ })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Provider role/ })).toBeInTheDocument();
    // The composition step never exposes a free-text role ARN or endpoint.
    expect(document.querySelector('input[name="roleArn"]')).toBeNull();
    expect(document.querySelector('input[name="bucketEndpoint"]')).toBeNull();
    expect(document.querySelector('input[name="bucketName"]')).not.toBeNull();
    expect(document.querySelector('input[name="prefix"]')).not.toBeNull();
  });

  test("surfaces a server field error", async () => {
    mockActionData = { status: "error", errors: { providerRoleId: ["Unknown provider role"] } };
    renderForm();
    await waitFor(() => {
      expect(screen.getByText("Unknown provider role")).toBeInTheDocument();
    });
  });
});
