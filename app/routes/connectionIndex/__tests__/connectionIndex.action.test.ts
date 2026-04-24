import { ActionFunctionArgs } from "react-router";

const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("~/routes/connectionIndex/connectionIndexCreate", () => ({
  connectionIndexCreate: (...args: unknown[]) => mockCreate(...args),
}));
vi.mock("~/routes/connectionIndex/connectionIndexUpdate", () => ({
  connectionIndexUpdate: (...args: unknown[]) => mockUpdate(...args),
}));

describe("connectionIndex.action dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(new Response(null, { status: 302 }));
    mockUpdate.mockResolvedValue(Response.json({ patched: true }));
  });

  async function dispatch(method: string) {
    const { action } = await import(
      "~/routes/connectionIndex/connectionIndex.action"
    );
    return action({
      params: { connectionName: "x" },
      context: {} as never,
      request: new Request("http://localhost/connectionIndex/x", { method }),
    } as unknown as ActionFunctionArgs);
  }

  test("POST routes to connectionIndexCreate", async () => {
    await dispatch("POST");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("PATCH routes to connectionIndexUpdate", async () => {
    await dispatch("PATCH");
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test("other methods return 405", async () => {
    const response = (await dispatch("DELETE")) as Response;
    expect(response.status).toBe(405);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
