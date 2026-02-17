import "@testing-library/jest-dom";
import { mockAnimationsApi } from "jsdom-testing-mocks";
import { createElement } from "react";
import { beforeAll } from "vitest";

// Provide a working Storage implementation for Zustand persist middleware.
// Node.js 24's built-in localStorage is broken without --localstorage-file,
// and happy-dom doesn't fully override it.
function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

Object.defineProperty(globalThis, "localStorage", {
  value: createStorageMock(),
  writable: true,
});

Object.defineProperty(globalThis, "sessionStorage", {
  value: createStorageMock(),
  writable: true,
});

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

// Reset all mocks and storage after each test file
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
