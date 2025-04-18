/**
 * Constant definitions for Frontegg API interactions
 */

/**
 * HTTP Method constants
 */
export const HttpMethods = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DELETE",
};

/**
 * Common endpoints for Frontegg API
 */
export const FronteggEndpoints = {
  ROLES: "/identity/resources/roles/v1",
  PERMISSIONS: "/identity/resources/permissions/v1",
  PERMISSIONS_CLASSIFICATION:
    "/identity/resources/permissions/v1/classification",
  PERMISSION_CATEGORIES: "/identity/resources/permissions/v1/categories",
  USERS: "/identity/resources/users/v1",
  USERS_V2: "/identity/resources/users/v2",
  USERS_V3: "/identity/resources/users/v3",
  TENANT_ACCESS_TOKENS: "/identity/resources/tenants/access-tokens/v1",
  CLIENT_CREDENTIALS_TOKENS: "/identity/resources/tenants/api-tokens/v1",
  CREATE_CLIENT_CREDENTIALS_TOKEN: "/identity/resources/tenants/api-tokens/v2",
  USER_ACCESS_TOKENS: "/identity/resources/users/access-tokens/v1",
  USER_API_TOKENS: "/identity/resources/users/api-tokens/v1",
  APPLICATION: "/identity/resources/applications/v1",
  TENANTS_V1: "/tenants/resources/tenants/v1",
  TENANTS_V2: "/tenants/resources/tenants/v2",
};
