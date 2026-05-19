import { describe, it, expect, vi } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("axios");
vi.mock("../../../../src/platform/utils/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../../../src/platform/auth", () => ({
  fronteggBaseUrl: "https://api.frontegg.com",
  getValidToken: vi.fn().mockResolvedValue("test-token"),
}));

import {
  createBaseHeaders,
  buildFronteggUrl,
  formatToolResponse,
} from "../../../../src/platform/utils/api/frontegg-api";

// ── createBaseHeaders ──────────────────────────────────────────────────────

describe("createBaseHeaders", () => {
  it("returns only Content-Type when no options passed", () => {
    const headers = createBaseHeaders();
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["frontegg-tenant-id"]).toBeUndefined();
    expect(headers["frontegg-user-id"]).toBeUndefined();
  });

  it("includes frontegg-tenant-id when fronteggTenantIdHeader provided", () => {
    const headers = createBaseHeaders({ fronteggTenantIdHeader: "tenant-abc" });
    expect(headers["frontegg-tenant-id"]).toBe("tenant-abc");
    expect(headers["frontegg-user-id"]).toBeUndefined();
  });

  it("includes frontegg-user-id when userIdHeader provided", () => {
    const headers = createBaseHeaders({ userIdHeader: "user-xyz" });
    expect(headers["frontegg-user-id"]).toBe("user-xyz");
    expect(headers["frontegg-tenant-id"]).toBeUndefined();
  });

  it("includes both tenant and user headers when both options provided", () => {
    const headers = createBaseHeaders({
      fronteggTenantIdHeader: "tenant-abc",
      userIdHeader: "user-xyz",
    });
    expect(headers["frontegg-tenant-id"]).toBe("tenant-abc");
    expect(headers["frontegg-user-id"]).toBe("user-xyz");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// ── buildFronteggUrl ───────────────────────────────────────────────────────

describe("buildFronteggUrl", () => {
  it("constructs URL from base + endpoint", () => {
    const url = buildFronteggUrl("/identity/resources/roles/v1");
    expect(url).toBeInstanceOf(URL);
    expect(url.pathname).toBe("/identity/resources/roles/v1");
    expect(url.hostname).toBe("api.frontegg.com");
  });

  it("appends a plain path param when provided", () => {
    const url = buildFronteggUrl("/identity/resources/roles/v1", "role-id-123");
    expect(url.pathname).toBe("/identity/resources/roles/v1/role-id-123");
  });

  it("encodes special characters in the path param", () => {
    const id = "role/with spaces&chars";
    const url = buildFronteggUrl("/identity/resources/roles/v1", id);
    expect(url.toString()).toContain(encodeURIComponent(id));
    expect(url.toString()).not.toContain(" ");
  });
});

// ── formatToolResponse ─────────────────────────────────────────────────────

describe("formatToolResponse", () => {
  it("returns isError:false for a successful response", () => {
    const result = formatToolResponse({
      success: true,
      status: 200,
      statusText: "OK",
      data: { id: "abc", name: "Admin" },
      error: undefined,
    });
    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe("text");
  });

  it("returns compact JSON with no indentation for success data", () => {
    const data = { id: "abc", name: "Admin" };
    const result = formatToolResponse({
      success: true,
      status: 200,
      statusText: "OK",
      data,
      error: undefined,
    });
    expect(result.content[0].text).toBe(JSON.stringify(data));
    expect(result.content[0].text).not.toContain("\n");
  });

  it("returns isError:true for a failed response", () => {
    const result = formatToolResponse({
      success: false,
      status: 401,
      statusText: "Unauthorized",
      data: null,
      error: { message: "Invalid token" },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("401");
    expect(result.content[0].text).toContain("Unauthorized");
  });

  it("uses customMessage instead of data when provided", () => {
    const result = formatToolResponse(
      {
        success: true,
        status: 200,
        statusText: "OK",
        data: { id: "abc" },
        error: undefined,
      },
      "Role created successfully."
    );
    expect(result.content[0].text).toBe("Role created successfully.");
  });

  it("returns status string when data is null", () => {
    const result = formatToolResponse({
      success: true,
      status: 204,
      statusText: "No Content",
      data: null,
      error: undefined,
    });
    expect(result.content[0].text).toContain("204");
    expect(result.content[0].text).toContain("No Content");
  });
});
