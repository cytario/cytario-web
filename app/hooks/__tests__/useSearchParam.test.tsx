import { renderHook, act } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { useSearchParam } from "~/hooks/useSearchParam";

// Wrapper component for testing hooks that use router
const createWrapper = (initialEntries: string[] = ["/"]) => {
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: React.ReactNode }) => {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  };
};

describe("useSearchParam", () => {
  test("should return empty string when param doesn't exist", () => {
    const { result } = renderHook(() => useSearchParam("test"), {
      wrapper: createWrapper(),
    });

    const [paramValue] = result.current;
    expect(paramValue).toBe("");
  });

  test("should return param value when it exists", () => {
    const { result } = renderHook(() => useSearchParam("query"), {
      wrapper: createWrapper(["/?query=searchterm"]),
    });

    const [paramValue] = result.current;
    expect(paramValue).toBe("searchterm");
  });

  test("should update param value", () => {
    const { result } = renderHook(() => useSearchParam("query"), {
      wrapper: createWrapper(),
    });

    const [, updateParam] = result.current;

    act(() => {
      updateParam("newvalue");
    });

    const [updatedValue] = result.current;
    expect(updatedValue).toBe("newvalue");
  });

  test("should remove param when empty string is provided", () => {
    const { result } = renderHook(() => useSearchParam("query"), {
      wrapper: createWrapper(["/?query=initial"]),
    });

    // Initial value should exist
    let [paramValue] = result.current;
    expect(paramValue).toBe("initial");

    const [, updateParam] = result.current;

    act(() => {
      updateParam("");
    });

    // After setting empty string, param should be removed
    [paramValue] = result.current;
    expect(paramValue).toBe("");
  });

  test("should remove param when whitespace-only string is provided", () => {
    const { result } = renderHook(() => useSearchParam("query"), {
      wrapper: createWrapper(["/?query=initial"]),
    });

    const [, updateParam] = result.current;

    act(() => {
      updateParam("   ");
    });

    const [paramValue] = result.current;
    expect(paramValue).toBe("");
  });

  test("should handle multiple params", () => {
    const { result: queryResult } = renderHook(() => useSearchParam("query"), {
      wrapper: createWrapper(["/?query=search&page=2"]),
    });
    const { result: pageResult } = renderHook(() => useSearchParam("page"), {
      wrapper: createWrapper(["/?query=search&page=2"]),
    });

    const [queryValue] = queryResult.current;
    const [pageValue] = pageResult.current;

    expect(queryValue).toBe("search");
    expect(pageValue).toBe("2");
  });
});