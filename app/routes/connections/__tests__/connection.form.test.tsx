import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      name: "Prod",
      providerType: "aws",
      endpoint: null,
      region: "eu-central-1",
      status: "connected",
    },
    {
      id: "pc-public",
      name: "Public",
      providerType: "aws",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
      status: "connected",
      isPublic: true,
    },
  ],
  providerRoles: [
    {
      providerConnectionId: "pc-1",
      roleArn: "arn:aws:iam::123456789012:role/reader",
      allowedScopes: ["lab"],
      accessLevel: "read-only",
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

function renderFormAt(path: string, adminScopes: string[] = [], defaultScope?: string) {
  const Stub = createRoutesStub([
    {
      path: "/connections",
      Component: () => (
        <ConnectionForm
          adminScopes={adminScopes}
          userId="test-user-id"
          defaultScope={defaultScope}
        />
      ),
    },
  ]);
  return render(<Stub initialEntries={[path]} />);
}

async function openProviderSelect() {
  const user = userEvent.setup();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Provider connection/ })).toBeInTheDocument();
  });
  await user.click(screen.getByRole("button", { name: /Provider connection/ }));
  return user;
}

describe("ConnectionForm — FK selectors (SRS-CY-32118)", () => {
  test("renders the provider selectors, not free-text role/endpoint inputs", async () => {
    renderForm();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Provider connection/ })).toBeInTheDocument();
    });
    // The composition step never exposes a free-text role ARN or endpoint.
    expect(document.querySelector('input[name="roleArn"]')).toBeNull();
    expect(document.querySelector('input[name="bucketEndpoint"]')).toBeNull();
    expect(document.querySelector('input[name="bucketName"]')).not.toBeNull();
    expect(document.querySelector('input[name="prefix"]')).not.toBeNull();
  });

  test("surfaces a server field error", async () => {
    mockActionData = {
      status: "error",
      errors: { "grants.0.accessLevel": ["Unknown access level"] },
    };
    renderForm();
    await waitFor(() => {
      expect(screen.getByText("Unknown access level")).toBeInTheDocument();
    });
  });
});

describe("ConnectionForm — built-in public provider bucket input", () => {
  test("the bucket is free text when the selected provider connection is public", async () => {
    renderForm(["lab"]);
    const user = await openProviderSelect();
    await user.click(screen.getByRole("option", { name: "Public" }));

    const bucketInput = (await screen.findByLabelText(/Bucket/)) as HTMLInputElement;
    expect(bucketInput.tagName).toBe("INPUT");
    expect(bucketInput.placeholder).toBe("my-bucket");

    await user.type(bucketInput, "any-public-bucket");
    expect(bucketInput.value).toBe("any-public-bucket");
  });

  test("no bucket-catalog banner shows for the public provider even when the catalog is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("bucket-catalog")) {
          return { json: async () => ({ source: "portal", error: "Bucket catalog down." }) };
        }
        return { json: async () => ({ catalog }) } as unknown as Response;
      }),
    );
    renderForm(["lab"]);
    const user = await openProviderSelect();
    await user.click(screen.getByRole("option", { name: "Public" }));

    await screen.findByLabelText(/Bucket/);
    expect(screen.queryByText("Bucket catalog unavailable")).toBeNull();
    expect((screen.getByLabelText(/Bucket/) as HTMLInputElement).tagName).toBe("INPUT");
  });

  test("the public provider option label is exactly its name", async () => {
    renderForm(["lab"]);
    const user = await openProviderSelect();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Public" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: "Public" }));
    await screen.findByLabelText(/Endpoint/);
  });

  test("the endpoint input appears for a public provider and accepts an optional value", async () => {
    renderForm(["lab"]);
    const user = await openProviderSelect();
    await user.click(screen.getByRole("option", { name: "Public" }));

    const endpointInput = (await screen.findByLabelText(/Endpoint/)) as HTMLInputElement;
    // The placeholder suggests a mirror URL, not an AWS regional endpoint —
    // an AWS-looking default wrongly implies we pin the bucket's region.
    expect(endpointInput.placeholder).toBe("https://mirror.example.com");
    await user.type(endpointInput, "http://localhost:9000");
    expect(endpointInput.value).toBe("http://localhost:9000");
  });

  test("the endpoint input is absent for a non-public provider", async () => {
    renderForm(["lab"]);
    const user = await openProviderSelect();
    await user.click(screen.getByRole("option", { name: /Prod/ }));

    expect(screen.queryByLabelText(/Endpoint/)).toBeNull();
  });
});

describe("ConnectionForm — name suggestion", () => {
  test("a late suggestion never clobbers a name the user already typed", async () => {
    renderForm(["lab"]);
    const user = await openProviderSelect();
    await user.click(screen.getByRole("option", { name: /Prod/ }));

    // The public-provider fixtures render the bucket as free text; Prod also
    // does in the test catalog (no bucket rows in the mocked catalog fetch).
    const bucketInput = (await screen.findByLabelText(/Bucket/)) as HTMLInputElement;
    await user.type(bucketInput, "my-bucket");

    // The suggestion lands for the bucket…
    await waitFor(() => {
      expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("my-bucket");
    });

    // …then the user types their own name and the prefix changes afterwards,
    // firing the suggestion effect again after the edit.
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "My-Connection");
    const prefixInput = screen.getByLabelText("Prefix") as HTMLInputElement;
    await user.type(prefixInput, "some/prefix");

    expect(nameInput.value).toBe("My-Connection");
  });
});

describe("ConnectionForm — submit target", () => {
  test("submits to the connections action preserving the modal search param", async () => {
    // An explicit action path resolves without the current search params, so a
    // submit from inside a modal must carry them explicitly — otherwise the
    // modal unmounts on submit and a server error banner never renders.
    renderFormAt("/connections?modal=add-connection", ["lab"], "lab");
    const user = await openProviderSelect();
    await user.click(screen.getByRole("option", { name: /Prod/ }));

    const bucketInput = (await screen.findByLabelText(/Bucket/)) as HTMLInputElement;
    await user.type(bucketInput, "my-bucket");
    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    await user.type(nameInput, "My-Connection");

    // Step 0 → 1: the default grant row is pre-filled with the first admin
    // scope, so the grants step validates as-is.
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    // Step 1 → 2: confirm — the last step's button carries the submit label.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add Connection/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Add Connection/i }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
    expect(mockSubmit.mock.calls[0][1]).toMatchObject({
      method: "post",
      action: "/connections?modal=add-connection",
    });
  });
});
