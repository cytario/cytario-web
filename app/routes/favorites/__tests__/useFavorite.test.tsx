import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SerializedFavorite } from "../favorites.loader";
import { FavoritesProvider, useFavorite } from "../useFavorite";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const submit = vi.fn();
let fetcherState: "idle" | "submitting" = "idle";
let fetcherFormData: FormData | undefined;
let fetcherFormMethod: string | undefined;

vi.mock("react-router", () => ({
  useFetcher: () => ({
    submit,
    state: fetcherState,
    formData: fetcherFormData,
    formMethod: fetcherFormMethod,
  }),
}));

let favorites: SerializedFavorite[] = [];

const wrapper = ({ children }: { children: ReactNode }) => (
  <FavoritesProvider favorites={favorites}>{children}</FavoritesProvider>
);

beforeEach(() => {
  submit.mockClear();
  fetcherState = "idle";
  fetcherFormData = undefined;
  fetcherFormMethod = undefined;
  favorites = [];
});

const fav = (connectionId: string, pathName: string): SerializedFavorite => ({
  id: "fav-uuid-1",
  connectionId,
  connectionName: connectionId,
  pathName,
  displayName: pathName || connectionId,
  totalSize: null,
  lastModified: null,
});

const lastModified = new Date("2024-01-02T03:04:05Z");

const fileNode: TreeNode = {
  id: "conn/dir/img.tif",
  connectionId: "conn",
  connectionName: "conn",
  pathName: "dir/img.tif",
  name: "img.tif",
  type: "file",
  _Object: { Size: 1234, LastModified: lastModified } as TreeNode["_Object"],
};

const loadedDir: TreeNode = {
  id: "conn/dir/",
  connectionId: "conn",
  connectionName: "conn",
  pathName: "dir/",
  name: "dir",
  type: "directory",
  children: [fileNode],
};

const dirStub: TreeNode = {
  id: "conn/empty/",
  connectionId: "conn",
  connectionName: "conn",
  pathName: "empty/",
  name: "empty",
  type: "directory",
  children: [],
};

describe("useFavorite", () => {
  test("isFavorite reconciles a directory's trailing slash with the stored key", () => {
    favorites = [fav("conn", "dir")];
    const { result } = renderHook(() => useFavorite(loadedDir), { wrapper });
    expect(result.current.isFavorite).toBe(true);
  });

  test("isFavorite is false when the node is not in the favorites list", () => {
    favorites = [fav("other", "dir")];
    const { result } = renderHook(() => useFavorite(loadedDir), { wrapper });
    expect(result.current.isFavorite).toBe(false);
  });

  test("optimistically reflects an in-flight PUT for the affected node", () => {
    fetcherState = "submitting";
    fetcherFormMethod = "PUT";
    fetcherFormData = new FormData();
    fetcherFormData.append("connectionId", "conn");
    fetcherFormData.append("pathName", "dir");

    const { result } = renderHook(() => useFavorite(loadedDir), { wrapper });
    expect(result.current.isFavorite).toBe(true);
    expect(result.current.isPending).toBe(true);
  });

  test("a different in-flight node is not marked pending", () => {
    fetcherState = "submitting";
    fetcherFormMethod = "PUT";
    fetcherFormData = new FormData();
    fetcherFormData.append("connectionId", "conn");
    fetcherFormData.append("pathName", "other");

    const { result } = renderHook(() => useFavorite(loadedDir), { wrapper });
    expect(result.current.isPending).toBe(false);
  });

  test("adding a file carries its size and last-modified", () => {
    const { result } = renderHook(() => useFavorite(fileNode), { wrapper });
    act(() => result.current.toggle());
    expect(submit).toHaveBeenCalledWith(
      {
        connectionId: "conn",
        pathName: "dir/img.tif",
        displayName: "img.tif",
        totalSize: "1234",
        lastModified: String(lastModified.getTime()),
      },
      { method: "put", action: "/favorites" },
    );
  });

  test("adding a directory with a loaded listing sums child size/date", () => {
    const { result } = renderHook(() => useFavorite(loadedDir), { wrapper });
    act(() => result.current.toggle());
    expect(submit).toHaveBeenCalledWith(
      {
        connectionId: "conn",
        pathName: "dir",
        displayName: "dir",
        totalSize: "1234",
        lastModified: String(lastModified.getTime()),
      },
      { method: "put", action: "/favorites" },
    );
  });

  test("adding an unloaded directory stub omits size/date", () => {
    const { result } = renderHook(() => useFavorite(dirStub), { wrapper });
    act(() => result.current.toggle());
    expect(submit).toHaveBeenCalledWith(
      { connectionId: "conn", pathName: "empty", displayName: "empty" },
      { method: "put", action: "/favorites" },
    );
  });

  test("removing submits only the normalized key", () => {
    favorites = [fav("conn", "dir")];
    const { result } = renderHook(() => useFavorite(loadedDir), { wrapper });
    act(() => result.current.toggle());
    expect(submit).toHaveBeenCalledWith(
      { connectionId: "conn", pathName: "dir" },
      { method: "delete", action: "/favorites" },
    );
  });
});
