import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import ConnectionIndexRoute, {
  handle,
} from "~/routes/connectionIndex/connectionIndex.route";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {},
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/requestDurationMiddleware", () => ({
  requestDurationMiddleware: vi.fn(),
}));

vi.mock("@cytario/design", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn(), toasts: [], removeToast: vi.fn() }),
  };
});

vi.mock("~/components/Breadcrumbs/getCrumbs", () => ({
  getCrumbs: vi.fn(() => []),
}));

describe("ConnectionIndexRoute", () => {
  test("renders 'No index yet' + 'Create index' button when index missing", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connectionIndex/:connectionName",
        Component: ConnectionIndexRoute,
        handle,
        loader: () => ({ connectionName: "Exchange", exists: false }),
      },
    ]);

    render(<RemixStub initialEntries={["/connectionIndex/Exchange"]} />);

    expect(
      await screen.findByText(/No index yet/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create index/i }),
    ).toBeInTheDocument();
  });

  test("renders three-stat panel + 'Rebuild index' button when index exists", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connectionIndex/:connectionName",
        Component: ConnectionIndexRoute,
        handle,
        loader: () => ({
          connectionName: "Exchange",
          exists: true,
          objectCount: 1234,
          builtAt: "2025-06-15T12:00:00.000Z",
          sizeBytes: 2048,
        }),
      },
    ]);

    render(<RemixStub initialEntries={["/connectionIndex/Exchange"]} />);

    expect(await screen.findByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /rebuild index/i }),
    ).toBeInTheDocument();
  });

  test("shows the connection name in the heading", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connectionIndex/:connectionName",
        Component: ConnectionIndexRoute,
        handle,
        loader: () => ({ connectionName: "my-bucket", exists: false }),
      },
    ]);

    render(<RemixStub initialEntries={["/connectionIndex/my-bucket"]} />);

    expect(
      await screen.findByRole("heading", { name: /my-bucket/i }),
    ).toBeInTheDocument();
  });
});
