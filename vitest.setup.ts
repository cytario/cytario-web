import "@testing-library/jest-dom";
import { mockAnimationsApi } from "jsdom-testing-mocks";
import { createElement } from "react";
import { beforeAll } from "vitest";

// Mock the well-known endpoints for authentication
vi.mock("~/.server/auth/wellKnownEndpoints", () => ({
  wellKnownEndpoints: {
    authorization_endpoint: "http://auth.example.com/authorize",
    token_endpoint: "http://auth.example.com/token",
    revocation_endpoint: "http://auth.example.com/revoke",
    end_session_endpoint: "http://auth.example.com/logout",
    userinfo_endpoint: "http://auth.example.com/userinfo",
  },
}));

vi.mock("~/components/Tooltip/Tooltip", () => ({
  Tooltip: vi.fn(({ children }) =>
    createElement("div", { "data-testid": "tooltip" }, children)
  ),
}));

beforeAll(() => {
  // Set the locale to "en_US" to ensure consistent date formatting in tests
  process.env.LANG = "en_US.UTF-8";
  process.env.LC_ALL = "en_US.UTF-8";
  mockAnimationsApi();
});

// Reset all mocks after each test file
afterEach(() => {
  vi.restoreAllMocks();
});
