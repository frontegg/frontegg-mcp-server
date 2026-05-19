/**
 * frontegg_feature_guide — mobile-specific CIAM feature guidance.
 *
 * Given a feature topic, returns setup steps, mobile pitfalls, related
 * config flags, and links to Frontegg docs. Content is derived from the
 * official CIAM guides at developers.frontegg.com.
 */

import type { McpTool } from './mcp-types.js';
import type { ToolRegistry } from './registry.js';
import { textResult } from './registry.js';
import { Logger } from '../utils/logger.js';

export interface FeatureGuide {
  topic: string;
  title: string;
  summary: string;
  mobileSteps: string[];
  pitfalls: string[];
  relatedFlags: string[];
  docUrl: string;
}

const GUIDES: FeatureGuide[] = [
  {
    topic: 'social-login',
    title: 'Social Login (Apple, Google, GitHub, etc.)',
    summary:
      'Frontegg supports social login via OAuth providers. Each provider needs its own client credentials. In development, Frontegg provides shared credentials; for production you must add your own.',
    mobileSteps: [
      '1. Open **Frontegg Portal → Login Box builder** and toggle on the providers you need.',
      '2. For **Apple Sign In**: create an App ID with "Sign In with Apple" capability, register a Service ID (= Client ID), set Return URL to `https://{YOUR_FRONTEGG_DOMAIN}/identity/resources/auth/v2/user/sso/apple/postlogin`, generate a Private Key, then enter Service ID + Key ID + Team ID + Private Key in the portal.',
      '3. For **Google**: create an OAuth 2.0 Client ID in Google Cloud Console. For iOS add the `REVERSED_CLIENT_ID` URL scheme to Info.plist. For Android ensure the SHA-1 fingerprint is registered in the Google console.',
      '4. On **iOS**: add each provider\'s callback URL scheme to `CFBundleURLSchemes` in Info.plist and register Associated Domains (`applinks:{domain}`).',
      '5. On **Android**: add `<intent-filter>` with `android.intent.action.VIEW` and the provider\'s scheme/host under your login Activity in AndroidManifest.xml.',
      '6. For **Flutter/RN/Ionic**: configure both the iOS and Android native shells above, plus ensure the Frontegg SDK wrapper (`FronteggApp.init` / `<FronteggWrapper>` / `FronteggService`) is initialized before any social login call.',
    ],
    pitfalls: [
      'Using shared dev OAuth credentials in production → auth will fail or redirect to Frontegg test tenant.',
      'Apple Sign In: the Service ID (not the App ID) is the Client ID. Mixing them up silently fails.',
      'Apple Sign In: the private key can only be downloaded once; store it securely.',
      'Google on iOS: missing `REVERSED_CLIENT_ID` URL scheme causes Safari to hang after consent.',
      'Google on Android: SHA-1 fingerprint mismatch between debug/release keystore and Google Console.',
      'Social login cancel/reload: some providers do not send a cancel callback — handle the user returning to the app without a token.',
      'Cross-platform (Flutter/RN/Ionic): social login on iOS may use ASWebAuthenticationSession which has different redirect behavior than Android Custom Tabs.',
    ],
    relatedFlags: [
      'ios.useLegacySocialLoginFlow',
      'android.useLegacySocialLoginFlow',
      'ios.useAsWebAuthenticationForAppleLogin',
      'ios.handleLoginWithCustomSSO',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/authentication/social/overview',
  },
  {
    topic: 'passkeys',
    title: 'Passkeys (WebAuthn / FIDO2)',
    summary:
      'Passkeys use device biometrics (Face ID, Touch ID, fingerprint) for passwordless login via the WebAuthn/FIDO2 standard. Users register a passkey after their first login and can use it for subsequent logins.',
    mobileSteps: [
      '1. Enable **Passkeys** in the Login Box builder.',
      '2. On **iOS**: add `webcredentials:{YOUR_FRONTEGG_DOMAIN}` to the Associated Domains entitlement (in addition to `applinks:` for deep links).',
      '3. On **Android**: host a `.well-known/assetlinks.json` on your Frontegg domain linking your app\'s package name + SHA-256 fingerprint. Enable Digital Asset Links verification.',
      '4. Ensure your Frontegg domain serves `/.well-known/webauthn` (Frontegg hosts this automatically for managed domains).',
      '5. Test on a **real device** — simulators may not support biometric enrollment.',
    ],
    pitfalls: [
      'Passkeys CANNOT coexist with forced MFA or SSO — if both are enabled, passkeys are silently disabled.',
      'iOS: missing `webcredentials:` associated domain → passkey registration silently fails with error 1004.',
      'Android: asset links JSON must match the exact package name and signing certificate SHA-256 — debug vs release mismatch breaks it.',
      'WebView-based login (embedded mode) may not support platform authenticators; prefer hosted login (Custom Tab / ASWebAuthenticationSession) for passkeys.',
      'Users who enrolled a passkey on one device cannot use it on another unless cross-device sync (e.g. iCloud Keychain, Google Password Manager) is enabled.',
    ],
    relatedFlags: [
      'ios.keepUserLoggedInAfterReinstall',
      'ios.keychainService',
      'android.useAssetsLinks',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/authentication/credentials/passkeys',
  },
  {
    topic: 'step-up',
    title: 'Step-Up Authentication',
    summary:
      'Step-up auth requires additional identity verification before sensitive actions (payments, permission grants, admin operations). It leverages JWT claims `acr`, `amr`, and `auth_time` to determine whether the user has recently completed MFA.',
    mobileSteps: [
      '1. Enable at least one MFA method (OTP, SMS, authenticator app, or WebAuthn) in the Frontegg portal.',
      '2. In your mobile app, before a sensitive action, check the current JWT\'s `acr` claim for `http://schemas.openid.net/pape/policies/2007/06/multi-factor`.',
      '3. If the `acr` claim is absent or `auth_time` is older than your `max_age` threshold, redirect the user to re-authenticate.',
      '4. After re-auth, the updated JWT will carry the multi-factor `acr` and the `amr` array (e.g. `["mfa", "otp"]`).',
      '5. On mobile, use the Frontegg SDK\'s `stepUp()` or re-auth method — do NOT roll your own redirect.',
    ],
    pitfalls: [
      'Refresh tokens do NOT carry `acr`/`amr` claims — you must re-authenticate, not just refresh, for step-up.',
      'If `auth_time` is not checked, a stale token from hours ago could pass the step-up gate.',
      'On mobile, re-auth prompts a full login flow (WebView/Custom Tab) — design UX for the interruption.',
      'Step-up MFA methods include OTP, SMS, authenticator apps, and WebAuthn (both security key and platform).',
      'If the user has no MFA method enrolled, the step-up prompt will require enrollment first — handle this edge case.',
    ],
    relatedFlags: [],
    docUrl: 'https://developers.frontegg.com/ciam/guides/step-up/intro',
  },
  {
    topic: 'sessions',
    title: 'Session Management',
    summary:
      'Frontegg provides configurable session management: session duration, maximum active sessions per user, and the ability to revoke sessions. Sessions track device and location info.',
    mobileSteps: [
      '1. Configure session duration and max sessions in **Frontegg Portal → Security → Session Management**.',
      '2. Enable `enableSessionPerTenant` if your app supports multi-tenancy and each tenant should have an independent session.',
      '3. On mobile, handle session expiry gracefully — redirect to login when the access token expires and refresh fails.',
      '4. Use `enableOfflineMode` + `networkMonitoringIntervalSeconds` to handle connectivity drops without logging the user out.',
      '5. Expose session management in the self-service portal so end-users can view and revoke their own sessions.',
    ],
    pitfalls: [
      'Mobile apps frequently background/foreground — if session duration is too short, users get logged out on every app switch.',
      'Max sessions limit may lock out users who switch devices frequently; consider a reasonable limit (3-5).',
      'Refresh token expiry is separate from session duration — if the refresh token expires, the user must re-authenticate even if the session is "active".',
      'On iOS, reinstalling the app clears the keychain by default — set `keepUserLoggedInAfterReinstall: true` to persist sessions across reinstalls.',
      'Background push notifications that trigger token refresh can cause duplicate refresh requests — guard with a mutex.',
      'Low-connectivity scenarios: if the refresh call times out, do not immediately log out — retry with exponential backoff.',
    ],
    relatedFlags: [
      'ios.enableSessionPerTenant',
      'android.enableSessionPerTenant',
      'ios.enableOfflineMode',
      'android.enableOfflineMode',
      'ios.networkMonitoringInterval',
      'android.networkMonitoringIntervalSeconds',
      'ios.keepUserLoggedInAfterReinstall',
      'flutter.disableAutoRefresh',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/security-center/session-management/overview',
  },
  {
    topic: 'tokens',
    title: 'Token Management & JWT Claims',
    summary:
      'Frontegg issues JWTs with configurable claims: OIDC-required, Frontegg-required, user claims, entitlement claims, and account/tenant claims. You can create multiple token templates and apply them conditionally.',
    mobileSteps: [
      '1. Review token configuration in **Frontegg Portal → Security → Token Management**.',
      '2. Enable only the claims your mobile app needs — smaller tokens = faster parsing and less bandwidth.',
      '3. If using entitlements, ensure `entitlements` claims are included in the token template.',
      '4. Set appropriate access token and refresh token expiry times — mobile apps typically need longer refresh tokens (days/weeks) and shorter access tokens (minutes).',
      '5. Use the Frontegg SDK\'s built-in token refresh — do NOT manually decode and refresh JWTs.',
    ],
    pitfalls: [
      'Including too many claims bloats the JWT — on mobile with slow connections this adds latency to every authenticated request.',
      'Access token stale after tenant switch: if the user switches tenants, the old access token carries the previous tenant\'s claims until refreshed.',
      'Minimal token payloads may omit entitlements — check that your token template includes what your app needs.',
      'Custom JWT templates can accidentally strip required OIDC claims, breaking SDK validation.',
      'Refresh tokens sent in background push handlers may race with foreground refresh — deduplicate.',
    ],
    relatedFlags: [
      'ios.entitlementsEnabled',
      'android.entitlementsEnabled',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/security-center/token-management/overview',
  },
  {
    topic: 'security-rules',
    title: 'Security Rules (Bot Detection, Brute Force, etc.)',
    summary:
      'Frontegg provides 8 built-in security defenses: Bot Detection, New Device, Brute Force, Breached Password, Impossible Travel, Suspicious IPs, Stale Users, and Email Credibility. Each can be set to Allow / Challenge / Block / Lock.',
    mobileSteps: [
      '1. Configure security rules in **Frontegg Portal → Security → Security Rules**.',
      '2. For **Bot Detection**: choose reCAPTCHA — note that reCAPTCHA v2/v3 may not render correctly in mobile WebViews; prefer reCAPTCHA Enterprise with native SDK integration.',
      '3. For **Brute Force**: set max failed attempts and lockout duration. Mobile users on flaky connections may trigger false positives if retries are counted as failures.',
      '4. For **Impossible Travel**: cellular network IP changes can trigger false positives — consider "Challenge" instead of "Block" for mobile-heavy user bases.',
      '5. For **New Device**: every app reinstall or device change triggers this — ensure your users know to check their email for the verification prompt.',
    ],
    pitfalls: [
      'Bot Detection (reCAPTCHA) in a WebView login may show broken challenges or fail silently — test on real devices.',
      'Brute force lockout + auto-refresh failures: if the SDK retries a failed token refresh, each retry may count as a failed attempt.',
      'Impossible Travel is especially noisy on mobile (VPN, cellular handoff, travel) — Block mode will lock out legitimate users.',
      'New Device detection fires on every iOS reinstall unless `keepUserLoggedInAfterReinstall` is true (keychain persists device identity).',
      'Suspicious IP rules may block corporate proxy IPs used by mobile devices on enterprise WiFi.',
    ],
    relatedFlags: [
      'ios.keepUserLoggedInAfterReinstall',
      'ios.keychainService',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/security-center/security-rules/overview',
  },
  {
    topic: 'hosted-vs-embedded',
    title: 'Hosted vs Embedded Login',
    summary:
      'Hosted login redirects users to a Frontegg-hosted login page. Embedded login renders the login UI inside your app via SDK. Mobile apps typically use hosted login (via Custom Tab on Android / ASWebAuthenticationSession on iOS).',
    mobileSteps: [
      '1. Choose your mode in **Frontegg Portal → Authentication → Login method**.',
      '2. **Hosted (recommended for mobile)**: set Login URL to `https://{frontegg-domain}/oauth` and App URL to your app\'s URL scheme. The SDK opens a Custom Tab (Android) or ASWebAuthenticationSession (iOS).',
      '3. **Embedded**: set `hostedLoginBox: false` (or `embeddedMode: true` on iOS). The SDK renders the login UI in a WKWebView/WebView inside your app.',
      '4. Configure redirect URI to match your app\'s deep link scheme: `{scheme}://{host}/oauth/callback`.',
      '5. For Flutter/RN/Ionic: configure both the native iOS and Android redirect URIs.',
    ],
    pitfalls: [
      'Embedded mode uses WKWebView which does NOT share cookies with Safari — SSO sessions won\'t carry over.',
      'Hosted mode via Custom Tab shares Chrome cookies — better for SSO but the user briefly leaves your app.',
      'On iOS, ASWebAuthenticationSession shows a "X wants to use Y to sign in" prompt — this is expected, not a bug.',
      'Embedded mode on iOS Safari (Ionic) can get stuck after social login redirect — use hosted mode instead.',
      'If you declare BOTH EmbeddedAuthActivity AND HostedAuthActivity in AndroidManifest.xml, the SDK may crash or silently fall back to the wrong one.',
      'Redirect URI must use the FULL URL with scheme + host + path, not just the scheme — `myapp://auth` is not `myapp://auth/callback`.',
    ],
    relatedFlags: [
      'ios.embeddedMode',
      'ios.lateInit',
      'android.useChromeCustomTabs',
      'android.useDiskCacheWebview',
      'android.embedded-vs-hosted Activity declaration',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/env-settings/hosted-embedded',
  },
  {
    topic: 'multi-tenancy',
    title: 'Multi-Tenancy & Tenant Management',
    summary:
      'Frontegg supports multi-tenant architectures where users belong to one or more accounts (tenants). SSO can be configured per-tenant, and sessions can be isolated per-tenant.',
    mobileSteps: [
      '1. Enable `enableSessionPerTenant` in your SDK config to isolate sessions by tenant.',
      '2. For **multi-tenant SSO**: configure at **Frontegg Portal → Authentication → SSO → Multitenancy SSO**.',
      '3. When a user\'s email domain maps to multiple tenants, pass `tenantId` in the login URL: `?tenantId={tenantId}` — otherwise login will be blocked or route to the first-created tenant.',
      '4. Handle **tenant switching** in your app — after switching, the access token carries the old tenant\'s claims until refreshed. Call the SDK\'s `switchTenant()` method.',
      '5. Use `tenantResolver` (Android) to dynamically resolve the tenant at login time.',
    ],
    pitfalls: [
      'Tenant permission bleed: if the access token is not refreshed after switchTenant(), the user retains the old tenant\'s permissions.',
      'Session-per-tenant + offline mode: if both are enabled, ensure the offline cache is partitioned by tenant.',
      'Multi-tenant SSO: IdP-initiated login only works if the SSO connection is configured on exactly one tenant. Ambiguous domains require tenantId.',
      'On mobile, switching tenants triggers a full re-auth if session-per-tenant is enabled — design UX for this.',
      'loginOrganizationAlias (iOS) can override tenant routing — ensure it matches the intended tenant.',
    ],
    relatedFlags: [
      'ios.enableSessionPerTenant',
      'android.enableSessionPerTenant',
      'android.tenantResolver',
      'ios.loginOrganizationAlias',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/authentication/sso/management/multitenancy',
  },
  {
    topic: 'entitlements',
    title: 'Entitlements (Features, Plans & Permissions)',
    summary:
      'Entitlements go beyond RBAC — they answer "does this user have access to this feature?" via Features, Plans, and Feature Flags. Checked via `isEntitledTo` in backend SDKs or via JWT claims on mobile.',
    mobileSteps: [
      '1. Define Features and Plans in **Frontegg Portal → Entitlements**.',
      '2. Enable `entitlementsEnabled` in your SDK config to include entitlement claims in the JWT.',
      '3. On mobile, check entitlements by inspecting the JWT\'s `entitlements` claim — the Frontegg SDK exposes helpers for this.',
      '4. For real-time entitlement checks (not JWT-based), use the Entitlements Agent (backend Docker container) and call from your mobile app\'s backend.',
      '5. Map Frontegg Plans to third-party billing (e.g. Stripe) to auto-manage entitlements when subscriptions change.',
    ],
    pitfalls: [
      'Entitlement claims in the JWT may be stale — if a plan changes server-side, the mobile user\'s token still carries old entitlements until refreshed.',
      'The Entitlements Agent requires Docker — it cannot run on the mobile device itself. Use it from your backend.',
      'Feature flags are evaluated server-side — the mobile app only sees the result in the JWT.',
      'Including entitlement claims significantly increases JWT size — only enable if your app needs them.',
      'If `entitlementsEnabled` is false in the SDK config, entitlement claims are not requested even if configured in the portal.',
    ],
    relatedFlags: [
      'ios.entitlementsEnabled',
      'android.entitlementsEnabled',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/authorization/entitlements/intro',
  },
  {
    topic: 'sms-login',
    title: 'SMS / Passwordless Login',
    summary:
      'Users can register and log in using their phone number. A one-time SMS code is sent for verification. Magic links provide another passwordless option that opens the app via deep link.',
    mobileSteps: [
      '1. Enable **SMS login** in the Login Box builder\'s Quick sign-in section.',
      '2. Optionally include a phone number field in your signup form so users set it during registration.',
      '3. For **Magic Links**: ensure your deep link scheme is correctly configured — the magic link opens the app via `{scheme}://{host}/magic-link?token=...`.',
      '4. On mobile, use SMS autofill (iOS `textContentType: .oneTimeCode`, Android SMS Retriever API) to auto-populate the OTP field.',
      '5. Handle the case where the user taps the magic link on a different device than where they initiated login.',
    ],
    pitfalls: [
      'Setting a phone number in the Profile section of self-service does NOT affect the SMS sign-in flow — it must be set in Privacy & Security.',
      'Magic links on mobile: if the deep link scheme is not configured, the link opens in the browser instead of the app.',
      'Magic link double-login: tapping the link after the token has been consumed shows a blank screen or error — handle expired/used tokens gracefully.',
      'SMS delivery is not instant — show a "resend" button with a countdown timer, not an immediate retry.',
      'SMS MFA (for step-up) uses the same phone number as SMS login — users may confuse the two flows.',
    ],
    relatedFlags: [],
    docUrl: 'https://developers.frontegg.com/ciam/guides/authentication/credentials/sms',
  },
  {
    topic: 'sso',
    title: 'SSO (SAML & OIDC)',
    summary:
      'Frontegg supports SAML 2.0 and OpenID Connect SSO. Tenants can configure their own SSO connections via the self-service admin portal. Mobile apps handle SSO via the hosted login flow.',
    mobileSteps: [
      '1. Configure SSO at **Frontegg Portal → Authentication → SSO**.',
      '2. For **SAML**: your SP Entity ID and ACS URL are provided by Frontegg. The tenant\'s admin configures their IdP metadata in the self-service portal.',
      '3. For **OIDC**: configure the OIDC discovery URL, client ID, and client secret in the Frontegg portal.',
      '4. On mobile, SSO is handled transparently through the hosted login flow — the SDK redirects to the IdP and handles the callback.',
      '5. For multi-tenant SSO, pass `tenantId` in the login URL to route to the correct tenant\'s SSO connection.',
    ],
    pitfalls: [
      'SSO on mobile always goes through the hosted login flow (Custom Tab / ASWebAuthenticationSession) — embedded mode does not support SSO redirects well.',
      'IdP-initiated login may fail if the user has accounts in multiple tenants — enforce Frontegg-initiated login with tenantId.',
      'SAML on mobile: the POST binding callback may not work in all Custom Tab implementations — use Redirect binding.',
      'SSO + Passkeys: passkeys are disabled when SSO is enforced — cannot use both simultaneously.',
      'Role assignment via SSO (SCIM): roles assigned by the IdP may conflict with Frontegg role assignments — define a clear precedence.',
    ],
    relatedFlags: [
      'ios.handleLoginWithCustomSSO',
    ],
    docUrl: 'https://developers.frontegg.com/ciam/guides/authentication/sso/management/saml',
  },
  {
    topic: 'password-policy',
    title: 'Password Policies & Lockout',
    summary:
      'Frontegg supports configurable password policies: complexity (min length, special chars, mixed case), expiration, history, strength meter, and brute-force lockout.',
    mobileSteps: [
      '1. Configure password policies at **Frontegg Portal → Security → Password**.',
      '2. Set complexity rules (min length, character requirements) — these are enforced server-side; the mobile login box reflects them.',
      '3. Enable the **password strength meter** for real-time feedback during signup/change.',
      '4. Set **password expiry** (max days) — expired users are prompted to change on next login.',
      '5. Set **password history** (N previous passwords) — prevents reuse.',
      '6. Configure **brute force lockout** (max attempts + lockout duration) in Security → Security Rules.',
    ],
    pitfalls: [
      'Password complexity is enforced server-side — if your mobile app has a client-side form with different rules, users see conflicting error messages.',
      'Brute force lockout + auto-retry: if the SDK retries a failed login, each retry counts as an attempt.',
      'Password expiry prompts show in the hosted login flow but may not render correctly in embedded/WebView mode.',
      'Per-account policies can be stricter than environment-wide defaults — test both levels.',
      'Email verification during signup adds a step that may redirect the user away from the mobile app if deep links are not configured.',
    ],
    relatedFlags: [],
    docUrl: 'https://developers.frontegg.com/ciam/guides/authentication/credentials/passwords/overview',
  },
];

const TOPIC_LIST = GUIDES.map((g) => g.topic);

function formatGuide(g: FeatureGuide): string {
  const lines: string[] = [];
  lines.push(`# ${g.title}`);
  lines.push('');
  lines.push(g.summary);
  lines.push('');
  lines.push('## Mobile Setup Steps');
  for (const s of g.mobileSteps) lines.push(s);
  lines.push('');
  lines.push('## Common Pitfalls on Mobile');
  for (const p of g.pitfalls) lines.push(`- ${p}`);
  if (g.relatedFlags.length > 0) {
    lines.push('');
    lines.push('## Related SDK Config Flags');
    lines.push('');
    lines.push('Check these with `list_rules`:');
    for (const f of g.relatedFlags) lines.push(`- \`${f}\``);
  }
  lines.push('');
  lines.push(`## Docs`);
  lines.push(`[Frontegg Guide](${g.docUrl})`);
  return lines.join('\n');
}

export class FeatureGuideTool {
  private readonly logger = Logger.getInstance();

  public register(registry: ToolRegistry): void {
    const definition: McpTool = {
      name: 'frontegg_feature_guide',
      description:
        'Get mobile-specific setup guidance for a Frontegg CIAM feature. ' +
        `Topics: ${TOPIC_LIST.join(', ')}. ` +
        'Returns setup steps, common pitfalls on mobile, related SDK config flags, and doc links.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: TOPIC_LIST,
            description: `The feature topic. One of: ${TOPIC_LIST.join(', ')}`,
          },
        },
        required: ['topic'],
      },
    };

    registry.add(definition, async (raw: unknown) => {
      const args = raw as { topic: string };
      const guide = GUIDES.find((g) => g.topic === args.topic);
      if (!guide) {
        return textResult(
          `Unknown topic "${args.topic}". Available topics:\n${TOPIC_LIST.map((t) => `- ${t}`).join('\n')}`
        );
      }
      this.logger.info(`Feature guide requested: ${args.topic}`);
      return textResult(formatGuide(guide));
    });
  }
}

export { GUIDES as FEATURE_GUIDES };
