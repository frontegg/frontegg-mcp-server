import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Prevent dotenv from loading .env so we control env vars entirely in tests
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
vi.mock("../src/utils/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// Helper: re-import auth with a fresh module instance (resets tokenCache)
async function freshAuth() {
  vi.resetModules();
  vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));
  vi.mock("../src/utils/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  }));
  return await import("../src/auth");
}

describe("authenticateFrontegg", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FRONTEGG_CLIENT_ID;
    delete process.env.FRONTEGG_API_KEY;
  });

  it("throws when FRONTEGG_CLIENT_ID is missing", async () => {
    delete process.env.FRONTEGG_CLIENT_ID;
    delete process.env.FRONTEGG_API_KEY;
    const { authenticateFrontegg } = await freshAuth();
    await expect(authenticateFrontegg()).rejects.toThrow(
      "FRONTEGG_CLIENT_ID and FRONTEGG_API_KEY must be set"
    );
  });

  it("throws when FRONTEGG_API_KEY is missing", async () => {
    process.env.FRONTEGG_CLIENT_ID = "client-id";
    delete process.env.FRONTEGG_API_KEY;
    const { authenticateFrontegg } = await freshAuth();
    await expect(authenticateFrontegg()).rejects.toThrow(
      "FRONTEGG_CLIENT_ID and FRONTEGG_API_KEY must be set"
    );
  });

  it("returns token on successful auth", async () => {
    process.env.FRONTEGG_CLIENT_ID = "client-id";
    process.env.FRONTEGG_API_KEY = "api-key";

    const axiosMod = await import("axios");
    vi.spyOn(axiosMod.default, "post").mockResolvedValueOnce({
      data: { token: "my-token", expiresIn: 3600 },
    } as any);

    const { authenticateFrontegg } = await freshAuth();
    const token = await authenticateFrontegg();
    expect(token).toBe("my-token");
  });

  it("throws a descriptive error when the HTTP call fails", async () => {
    process.env.FRONTEGG_CLIENT_ID = "client-id";
    process.env.FRONTEGG_API_KEY = "api-key";

    const axiosMod = await import("axios");
    vi.spyOn(axiosMod.default, "post").mockRejectedValueOnce(
      new Error("Network error")
    );

    const { authenticateFrontegg } = await freshAuth();
    await expect(authenticateFrontegg()).rejects.toThrow(
      "Frontegg authentication failed"
    );
  });
});

describe("getValidToken", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.FRONTEGG_CLIENT_ID;
    delete process.env.FRONTEGG_API_KEY;
  });

  it("returns cached token and only calls authenticate once when token is fresh", async () => {
    process.env.FRONTEGG_CLIENT_ID = "client-id";
    process.env.FRONTEGG_API_KEY = "api-key";

    const axiosMod = await import("axios");
    const postSpy = vi
      .spyOn(axiosMod.default, "post")
      .mockResolvedValue({ data: { token: "cached-token", expiresIn: 3600 } } as any);

    const { getValidToken } = await freshAuth();
    const first = await getValidToken();
    const second = await getValidToken();

    expect(first).toBe("cached-token");
    expect(second).toBe("cached-token");
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates when token expires within the 300s buffer", async () => {
    process.env.FRONTEGG_CLIENT_ID = "client-id";
    process.env.FRONTEGG_API_KEY = "api-key";

    const axiosMod = await import("axios");
    const postSpy = vi
      .spyOn(axiosMod.default, "post")
      // First: expiresIn=1s — less than 300s buffer, triggers refresh next call
      .mockResolvedValueOnce({ data: { token: "expiring-token", expiresIn: 1 } } as any)
      // Second: fresh long-lived token
      .mockResolvedValueOnce({ data: { token: "fresh-token", expiresIn: 3600 } } as any);

    const { getValidToken } = await freshAuth();

    const first = await getValidToken();
    expect(first).toBe("expiring-token");

    const second = await getValidToken();
    expect(second).toBe("fresh-token");
    expect(postSpy).toHaveBeenCalledTimes(2);
  });
});
