import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

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

function renderForm(
  overrides: {
    adminScopes?: string[];
    userId?: string;
  } = {},
) {
  const userId = overrides.userId ?? "test-user-id";
  const adminScopes = overrides.adminScopes ?? [];

  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <ConnectionForm adminScopes={adminScopes} userId={userId} />
      ),
    },
  ]);

  return render(<Stub initialEntries={["/"]} />);
}

/** Query an input element by its `name` HTML attribute. */
function getInput(name: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`Input with name="${name}" not found`);
  return el;
}

// TODO(C-99): This queries by Field label, which doesn't work until Field
// wires its Label to the Select trigger via htmlFor/aria-labelledby.
/** Select MinIO provider on page 1 via the dropdown. */
async function selectMinIO(user: ReturnType<typeof userEvent.setup>) {
  const providerButton = screen.getByRole("button", {
    name: /Provider/,
  });
  await user.click(providerButton);
  const minioOption = screen.getByRole("option", { name: "MinIO" });
  await user.click(minioOption);
}

/** Fill page 1 required fields. */
async function fillPage1(user: ReturnType<typeof userEvent.setup>) {
  const uriInput = getInput("s3Uri");
  const nameInput = getInput("name");
  await user.type(uriInput, "test-bucket");
  await user.clear(nameInput);
  await user.type(nameInput, "test-conn");
}

/** Navigate to page 2 (AWS default) by filling page 1 and clicking Next. */
async function goToPage2() {
  const user = userEvent.setup();
  await fillPage1(user);

  const nextButton = screen.getByRole("button", { name: "Next" });
  await user.click(nextButton);

  await waitFor(() => {
    expect(screen.getByText("Role ARN")).toBeInTheDocument();
  });

  return user;
}

/** Navigate to page 2 with MinIO selected. */
async function goToPage2MinIO() {
  const user = userEvent.setup();
  await selectMinIO(user);
  await fillPage1(user);

  const nextButton = screen.getByRole("button", { name: "Next" });
  await user.click(nextButton);

  await waitFor(() => {
    expect(screen.getByText("Endpoint")).toBeInTheDocument();
  });

  return user;
}

/** Navigate to page 3 (Summary) for AWS. */
async function goToPage3() {
  const user = await goToPage2();

  const roleArnInput = getInput("roleArn");
  await user.type(roleArnInput, "arn:aws:iam::123456789012:role/MyRole");

  const nextButton = screen.getByRole("button", { name: "Next" });
  await user.click(nextButton);

  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Connect Storage" }),
    ).toBeInTheDocument();
  });

  return user;
}

/** Navigate to page 3 (Summary) for MinIO. */
async function goToPage3MinIO() {
  const user = await goToPage2MinIO();

  const endpointInput = getInput("bucketEndpoint");
  await user.type(endpointInput, "https://s3.cytario.com");

  const nextButton = screen.getByRole("button", { name: "Next" });
  await user.click(nextButton);

  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Connect Storage" }),
    ).toBeInTheDocument();
  });

  return user;
}

describe("ConnectionForm", () => {
  describe("page 1 — storage type", () => {
    test("renders Provider, S3 URI, and Name fields on page 1", () => {
      renderForm();

      expect(screen.getAllByText("Provider").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("S3 URI")).toBeInTheDocument();
      expect(screen.getByText("Name")).toBeInTheDocument();
    });

    test("renders s3:// prefix indicator", () => {
      renderForm();

      expect(screen.getByText("s3://")).toBeInTheDocument();
    });

    test("renders Next button on page 1", () => {
      renderForm();

      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    });

    // TODO(C-99): queries Select trigger by Field label — skipped until Field a11y is fixed
    test.skip("renders AWS S3 and MinIO provider options", async () => {
      const user = userEvent.setup();
      renderForm();

      const providerButton = screen.getByRole("button", {
        name: /Provider/,
      });
      await user.click(providerButton);

      expect(
        screen.getByRole("option", { name: "AWS S3" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "MinIO" })).toBeInTheDocument();
    });

    test("renders placeholder text for S3 URI input", () => {
      renderForm();

      expect(
        screen.getByPlaceholderText("my-bucket/path/prefix"),
      ).toBeInTheDocument();
    });

    test("does not advance when required fields are empty", async () => {
      const user = userEvent.setup();
      renderForm();

      const nextButton = screen.getByRole("button", { name: "Next" });
      await user.click(nextButton);

      // Should still be on page 1
      expect(screen.getByText("S3 URI")).toBeInTheDocument();
      expect(screen.queryByText("Role ARN")).not.toBeInTheDocument();
    });
  });

  describe("page 2 — visibility", () => {
    test("does not render Visibility on page 2 when adminScopes is empty", async () => {
      renderForm({ adminScopes: [] });
      await goToPage2();

      expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
    });

    test("renders Visibility select on page 2 when adminScopes are provided", async () => {
      renderForm({ adminScopes: ["cytario/lab"] });
      await goToPage2();

      expect(screen.getAllByText("Visibility").length).toBeGreaterThanOrEqual(
        1,
      );
    });

    // TODO(C-99): queries Select trigger by Field label — skipped until Field a11y is fixed
    test.skip("shows Personal and admin scope options in Visibility select", async () => {
      renderForm({
        adminScopes: ["cytario/lab", "cytario/team-a"],
        userId: "user-42",
      });
      const user = await goToPage2();

      const visibilityButton = screen.getByRole("button", {
        name: /Visibility/,
      });
      await user.click(visibilityButton);

      expect(
        screen.getByRole("option", { name: "Personal" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "cytario/lab" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "cytario/team-a" }),
      ).toBeInTheDocument();
    });
  });

  describe("page 2 — connection details (AWS)", () => {
    test("renders Role ARN and Region fields on page 2 for AWS", async () => {
      renderForm();
      await goToPage2();

      expect(screen.getByText("Role ARN")).toBeInTheDocument();
      expect(screen.getAllByText("Region").length).toBeGreaterThanOrEqual(1);
    });

    test("renders Role ARN placeholder", async () => {
      renderForm();
      await goToPage2();

      expect(
        screen.getByPlaceholderText("arn:aws:iam::123456789012:role/MyRole"),
      ).toBeInTheDocument();
    });

    test("renders Next button on page 2 (not submit)", async () => {
      renderForm();
      await goToPage2();

      expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Connect Storage" }),
      ).not.toBeInTheDocument();
    });

    test("shows Role ARN help text", async () => {
      renderForm();
      await goToPage2();

      expect(
        screen.getByText(/IAM role Cytario assumes to access your S3 data/),
      ).toBeInTheDocument();
    });

    test("shows Region help text", async () => {
      renderForm();
      await goToPage2();

      expect(
        screen.getByText(/AWS region where this bucket is located/),
      ).toBeInTheDocument();
    });
  });

  // TODO(C-99): all MinIO tests use selectMinIO which queries Select by Field label
  describe.skip("page 2 — connection details (MinIO)", () => {
    test("shows Endpoint instead of Role ARN when MinIO is selected", async () => {
      renderForm();
      await goToPage2MinIO();

      expect(screen.getByText("Endpoint")).toBeInTheDocument();
      expect(screen.queryByText("Role ARN")).not.toBeInTheDocument();
    });

    test("hides Region when MinIO is selected", async () => {
      renderForm();
      await goToPage2MinIO();

      expect(screen.queryAllByText("Region")).toHaveLength(0);
    });

    test("shows endpoint placeholder for MinIO", async () => {
      renderForm();
      await goToPage2MinIO();

      expect(
        screen.getByPlaceholderText("https://s3.cytario.com"),
      ).toBeInTheDocument();
    });
  });

  describe("page 3 — summary and confirm (AWS)", () => {
    test("renders Summary heading and Connect Storage button", async () => {
      renderForm();
      await goToPage3();

      expect(screen.getByText("Summary")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Connect Storage" }),
      ).toBeInTheDocument();
    });

    test("displays provider, name, bucket, and region in summary", async () => {
      renderForm();
      await goToPage3();

      expect(screen.getByText("AWS S3")).toBeInTheDocument();
      expect(screen.getByText("test-conn")).toBeInTheDocument();
      expect(screen.getByText("test-bucket")).toBeInTheDocument();
      expect(screen.getByText("eu-central-1")).toBeInTheDocument();
    });

    test("displays Role ARN in summary", async () => {
      renderForm();
      await goToPage3();

      expect(
        screen.getByText("arn:aws:iam::123456789012:role/MyRole"),
      ).toBeInTheDocument();
    });

    test("submits form data to /connections action", async () => {
      mockSubmit.mockClear();
      renderForm();
      const user = await goToPage3();

      const submitButton = screen.getByRole("button", {
        name: "Connect Storage",
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalledTimes(1);
      });

      const [formData, options] = mockSubmit.mock.calls[0];
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get("name")).toBe("test-conn");
      expect(formData.get("s3Uri")).toBe("test-bucket");
      expect(formData.get("providerType")).toBe("aws");
      expect(formData.get("roleArn")).toBe(
        "arn:aws:iam::123456789012:role/MyRole",
      );
      expect(options).toEqual({ method: "post", action: "/connections" });
    });
  });

  // TODO(C-99): all MinIO tests use selectMinIO which queries Select by Field label
  describe.skip("page 3 — summary and confirm (MinIO)", () => {
    test("displays MinIO provider and endpoint in summary", async () => {
      renderForm();
      await goToPage3MinIO();

      expect(screen.getByText("MinIO")).toBeInTheDocument();
      expect(screen.getByText("test-conn")).toBeInTheDocument();
      expect(screen.getByText("test-bucket")).toBeInTheDocument();
      expect(screen.getByText("https://s3.cytario.com")).toBeInTheDocument();
    });

    test("does not show Role ARN or Region in MinIO summary", async () => {
      renderForm();
      await goToPage3MinIO();

      // "Role ARN" should not be a dt label in the summary
      const dtElements = document.querySelectorAll("dt");
      const dtTexts = [...dtElements].map((dt) => dt.textContent);
      expect(dtTexts).not.toContain("Role ARN");
      expect(dtTexts).not.toContain("Region");
    });

    test("submits MinIO form data when Connect Storage is clicked", async () => {
      mockSubmit.mockClear();
      renderForm();
      const user = await goToPage3MinIO();

      const submitButton = screen.getByRole("button", {
        name: "Connect Storage",
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalledTimes(1);
      });

      const [formData] = mockSubmit.mock.calls[0];
      expect(formData.get("providerType")).toBe("minio");
      expect(formData.get("bucketEndpoint")).toBe("https://s3.cytario.com");
    });
  });

  describe("S3 URI auto-trim", () => {
    test("strips s3:// prefix from user input in the URI field", async () => {
      const user = userEvent.setup();
      renderForm();

      const uriInput = getInput("s3Uri");
      await user.clear(uriInput);
      await user.type(uriInput, "s3://my-bucket/data");

      await waitFor(() => {
        expect(uriInput).toHaveValue("my-bucket/data");
      });
    });

    test("accepts input without s3:// prefix as-is", async () => {
      const user = userEvent.setup();
      renderForm();

      const uriInput = getInput("s3Uri");
      await user.clear(uriInput);
      await user.type(uriInput, "my-bucket/path");

      await waitFor(() => {
        expect(uriInput).toHaveValue("my-bucket/path");
      });
    });
  });

  describe("name auto-suggest", () => {
    test("auto-fills name field from S3 URI input", async () => {
      const user = userEvent.setup();
      renderForm();

      const uriInput = getInput("s3Uri");
      await user.type(uriInput, "my-bucket");

      const nameInput = getInput("name");
      await waitFor(() => {
        expect(nameInput).toHaveValue("my-bucket");
      });
    });

    test("auto-suggests name with last path segment from URI with path", async () => {
      const user = userEvent.setup();
      renderForm();

      const uriInput = getInput("s3Uri");
      await user.type(uriInput, "my-bucket/data/images");

      const nameInput = getInput("name");
      await waitFor(() => {
        expect(nameInput).toHaveValue("my-bucket images");
      });
    });

    test("stops auto-suggesting after user manually edits the name field", async () => {
      const user = userEvent.setup();
      renderForm();

      const uriInput = getInput("s3Uri");
      const nameInput = getInput("name");

      await user.type(uriInput, "my-bucket");
      await waitFor(() => {
        expect(nameInput).toHaveValue("my-bucket");
      });

      await user.clear(nameInput);
      await user.type(nameInput, "custom-name");

      await user.clear(uriInput);
      await user.type(uriInput, "other-bucket");

      expect(nameInput).toHaveValue("custom-name");
    });
  });

  describe("field descriptions", () => {
    test("shows S3 URI help text on page 1", () => {
      renderForm();

      expect(
        screen.getByText(/Bucket name and optional path prefix/),
      ).toBeInTheDocument();
    });

    test("shows Name help text on page 1", () => {
      renderForm();

      expect(
        screen.getByText(/A friendly name, auto-suggested from the S3 URI/),
      ).toBeInTheDocument();
    });
  });

  describe("server errors", () => {
    test("displays server-side error messages from action data", () => {
      mockActionData = {
        status: "error",
        errors: { name: ["This name is already taken."] },
      };

      renderForm();

      expect(
        screen.getByText("This name is already taken."),
      ).toBeInTheDocument();

      mockActionData = null;
    });
  });
});
