/**
 * Tool schema validation tests.
 *
 * Each tool exposes a Zod schema that the MCP framework uses to validate
 * input from AI clients. These tests verify:
 * - Valid inputs are accepted
 * - Invalid / missing required fields are rejected
 * - Optional fields are truly optional
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── helpers ────────────────────────────────────────────────────────────────

/** Build schema object the same way tools pass it to server.tool() */
function schema<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}

// ── role schemas ───────────────────────────────────────────────────────────

const createRoleSchema = schema({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  migrateRole: z.boolean().optional(),
  firstUserRole: z.boolean().optional(),
  level: z.number().int().min(0).max(32767),
  fronteggTenantIdHeader: z.string().optional(),
});

describe("create-role schema", () => {
  it("accepts a minimal valid payload", () => {
    const result = createRoleSchema.safeParse({ key: "admin", name: "Admin", level: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated payload", () => {
    const result = createRoleSchema.safeParse({
      key: "admin",
      name: "Admin",
      description: "Admins",
      isDefault: false,
      migrateRole: true,
      firstUserRole: false,
      level: 100,
      fronteggTenantIdHeader: "tenant-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when required fields are missing", () => {
    expect(createRoleSchema.safeParse({ name: "Admin" }).success).toBe(false); // missing key, level
    expect(createRoleSchema.safeParse({ key: "admin", level: 0 }).success).toBe(false); // missing name
  });

  it("rejects level outside 0–32767", () => {
    expect(createRoleSchema.safeParse({ key: "k", name: "n", level: -1 }).success).toBe(false);
    expect(createRoleSchema.safeParse({ key: "k", name: "n", level: 32768 }).success).toBe(false);
  });

  it("rejects unknown extra fields (.strict())", () => {
    const result = createRoleSchema.safeParse({ key: "k", name: "n", level: 0, unknown: "x" });
    expect(result.success).toBe(false);
  });
});

// ── user schemas ───────────────────────────────────────────────────────────

const inviteUserSchema = schema({
  email: z.string().email(),
  name: z.string().optional(),
  fronteggTenantIdHeader: z.string(),
  profilePictureUrl: z.string().optional(),
  password: z.string().optional(),
  phoneNumber: z.string().optional(),
  provider: z
    .enum(["local", "saml", "google", "github", "facebook", "microsoft", "scim2", "slack", "apple"])
    .default("local")
    .optional(),
  metadata: z.string().optional(),
  skipInviteEmail: z.boolean().optional(),
  expiresInMinutes: z.number().optional(),
  roleIds: z.array(z.string()).optional(),
});

describe("invite-user schema", () => {
  it("accepts a minimal valid payload", () => {
    const result = inviteUserSchema.safeParse({
      email: "user@example.com",
      fronteggTenantIdHeader: "tenant-abc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email address", () => {
    const result = inviteUserSchema.safeParse({
      email: "not-an-email",
      fronteggTenantIdHeader: "tenant-abc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fronteggTenantIdHeader", () => {
    const result = inviteUserSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid provider enum value", () => {
    const result = inviteUserSchema.safeParse({
      email: "user@example.com",
      fronteggTenantIdHeader: "t",
      provider: "google",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid provider value", () => {
    const result = inviteUserSchema.safeParse({
      email: "user@example.com",
      fronteggTenantIdHeader: "t",
      provider: "twitter",
    });
    expect(result.success).toBe(false);
  });
});

// ── assign-users-to-application schema ────────────────────────────────────

const assignUsersToApplicationSchema = schema({
  appId: z.string(),
  tenantId: z.string(),
  userIds: z.array(z.string()),
});

describe("assign-users-to-application schema", () => {
  it("accepts valid payload", () => {
    const result = assignUsersToApplicationSchema.safeParse({
      appId: "app-1",
      tenantId: "tenant-1",
      userIds: ["u1", "u2"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty userIds array", () => {
    const result = assignUsersToApplicationSchema.safeParse({
      appId: "app-1",
      tenantId: "tenant-1",
      userIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing appId", () => {
    const result = assignUsersToApplicationSchema.safeParse({
      tenantId: "tenant-1",
      userIds: ["u1"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string entries in userIds", () => {
    const result = assignUsersToApplicationSchema.safeParse({
      appId: "app-1",
      tenantId: "t",
      userIds: [1, 2],
    });
    expect(result.success).toBe(false);
  });
});

// ── get-user-api-tokens schema ─────────────────────────────────────────────

const getUserApiTokensSchema = schema({
  fronteggTenantIdHeader: z.string(),
  userId: z.string(),
});

describe("get-user-api-tokens schema", () => {
  it("accepts valid payload with fronteggTenantIdHeader (not tenantId)", () => {
    const result = getUserApiTokensSchema.safeParse({
      fronteggTenantIdHeader: "tenant-abc",
      userId: "user-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects old tenantId field name", () => {
    // After the rename fix, the old name should be rejected by .strict()
    const result = getUserApiTokensSchema.safeParse({
      tenantId: "tenant-abc",
      userId: "user-123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = getUserApiTokensSchema.safeParse({
      fronteggTenantIdHeader: "tenant-abc",
    });
    expect(result.success).toBe(false);
  });
});

// ── vendor integration schema ──────────────────────────────────────────────

const oAuthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  redirectUri: z.string().url(),
  authorizationUrl: z.string().url(),
  tokenUrl: z.string().url(),
  scope: z.string().optional(),
});

const createVendorIntegrationSchema = schema({
  name: z.string(),
  description: z.string().optional(),
  useFronteggIntegration: z.boolean(),
  oauthConfigurations: oAuthConfigSchema.optional(),
});

describe("create-vendor-integration schema", () => {
  it("accepts payload without oauthConfigurations when useFronteggIntegration=true", () => {
    const result = createVendorIntegrationSchema.safeParse({
      name: "My Integration",
      useFronteggIntegration: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with oauthConfigurations when useFronteggIntegration=false", () => {
    const result = createVendorIntegrationSchema.safeParse({
      name: "My Integration",
      useFronteggIntegration: false,
      oauthConfigurations: {
        clientId: "cid",
        clientSecret: "sec",
        redirectUri: "https://app.example.com/callback",
        authorizationUrl: "https://auth.example.com/authorize",
        tokenUrl: "https://auth.example.com/token",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects when name is missing", () => {
    const result = createVendorIntegrationSchema.safeParse({
      useFronteggIntegration: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL in oauthConfigurations.redirectUri", () => {
    const result = createVendorIntegrationSchema.safeParse({
      name: "x",
      useFronteggIntegration: false,
      oauthConfigurations: {
        clientId: "cid",
        clientSecret: "sec",
        redirectUri: "not-a-url",
        authorizationUrl: "https://auth.example.com/authorize",
        tokenUrl: "https://auth.example.com/token",
      },
    });
    expect(result.success).toBe(false);
  });
});
