/**
 * Tiny auth gate used by the `frontegg_configure_*` tools. Every configure
 * handler calls `requireAuth()` before doing anything else; if the user
 * hasn't run `frontegg_login`, the tool returns a polite message instead
 * of hitting the Management API.
 */

import { isAuthenticated, getSession } from './frontegg-login.js';

export type AuthGateResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

export function requireAuth(): AuthGateResult {
  if (!isAuthenticated()) {
    return {
      ok: false,
      message:
        'Please run frontegg_login first to authenticate to your Frontegg tenant.',
    };
  }
  const session = getSession()!;
  return { ok: true, email: session.email };
}
