import { RuleMeta } from './types.js';
import { SdkKnowledge } from '../knowledge/types.js';

/**
 * Expanded, SDK-aware rule catalog. Static rules live here; dynamic rules
 * extracted from canonical SDK repo "known issues" / "troubleshooting"
 * sections are merged in at runtime via `getRules(knowledge)`.
 */
export const STATIC_RULES: RuleMeta[] = [
  // ----- Common / env / security -----
  {
    id: 'common.env.missing',
    title: 'Missing Frontegg env keys',
    description: 'FRONTEGG_APP_ID and FRONTEGG_BASE_URL must be set for every SDK flavor.',
    severity: 'critical',
    platforms: ['common'],
    flow: 'env',
    troubleshooting:
      'Without these, the SDK cannot reach the Frontegg tenant. Verify `process.env.FRONTEGG_*` is populated at runtime, not just at build time.',
  },
  {
    id: 'common.baseUrl.insecure',
    title: 'FRONTEGG_BASE_URL uses HTTP',
    description: 'Tokens and auth cookies must only flow over HTTPS.',
    severity: 'high',
    platforms: ['common'],
    flow: 'security',
    troubleshooting:
      'HTTP base URLs leak bearer tokens. Switch to https://app-<subdomain>.frontegg.com.',
  },
  {
    id: 'common.env.gitignore.missing',
    title: '.env not in .gitignore',
    description: '.env files containing Frontegg credentials must not be committed.',
    severity: 'high',
    platforms: ['common'],
    flow: 'security',
    troubleshooting:
      'Run `git log -- .env` — if the file has ever been committed, rotate clientId and applicationId immediately.',
  },

  // ----- Android -----
  {
    id: 'android.intentFilter.missing',
    title: 'Missing intent-filter for deep links',
    description: 'VIEW/BROWSABLE/DEFAULT intent-filter with your scheme+host is required.',
    severity: 'high',
    platforms: ['android'],
    flow: 'deep-link',
    troubleshooting:
      'Verify with `adb shell am start -W -a android.intent.action.VIEW -d "yourapp://auth"` — the activity should open.',
  },
  {
    id: 'android.internetPermission.missing',
    title: 'Missing INTERNET permission',
    description: 'Without <uses-permission android:name="android.permission.INTERNET"> the SDK cannot make HTTPS calls.',
    severity: 'high',
    platforms: ['android'],
    flow: 'build',
  },
  {
    id: 'android.gradle.appId.missing',
    title: 'applicationId not declared',
    description: 'Ensure applicationId/namespace is set in app/build.gradle.',
    severity: 'low',
    platforms: ['android'],
    flow: 'build',
  },
  {
    id: 'android.sdk.dependency.missing',
    title: 'Frontegg Android SDK dependency missing',
    description:
      'Link the Frontegg Android SDK in app/build.gradle. The artifact is NOT on Maven Central; use the local :android Gradle module (when working inside the canonical SDK repo) or the JitPack coordinate `com.github.frontegg:frontegg-android-kotlin:<tag>`.',
    severity: 'high',
    platforms: ['android'],
    flow: 'build',
  },
  {
    id: 'android.init.missing',
    title: 'FronteggApp.init not called in Application.onCreate',
    description:
      'The Frontegg Android SDK never bootstraps if FronteggApp.init(...) is not called from your Application subclass onCreate(). Without it, every auth call fails with `frontegg.error.app_must_be_initialized` and deep links cold-start into a crash.',
    severity: 'critical',
    platforms: ['android'],
    flow: 'init',
    troubleshooting:
      'In your Application subclass `onCreate()`, after `super.onCreate()`, call `FronteggApp.init(fronteggDomain = "<your-app>.frontegg.com", clientId = "<client-id>", context = this)`. Alternatives: (b) put `manifestPlaceholders = ["frontegg_domain": ..., "frontegg_client_id": ...]` in `app/build.gradle defaultConfig` so the SDK reads them at merge time; or (c) ship a `frontegg.properties` file at the project root. Make sure your Application class is registered in AndroidManifest.xml with `android:name=".App"`.',
    docAnchor:
      'https://github.com/frontegg/frontegg-android-kotlin/blob/master/app/src/main/java/com/frontegg/demo/App.kt',
  },

  // ----- iOS -----
  {
    id: 'ios.urlTypes.missing',
    title: 'Missing URL schemes / universal links',
    description: 'CFBundleURLTypes or Associated Domains must be declared for login redirect.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'deep-link',
  },
  {
    id: 'ios.associatedDomains.missing',
    title: 'Associated Domains not configured',
    description: 'Enable universal links with com.apple.developer.associated-domains applinks:.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'deep-link',
  },
  {
    id: 'ios.entitlements.file.missing',
    title: 'No entitlements file found',
    description: 'Create an .entitlements file to hold Associated Domains and other capabilities.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'deep-link',
  },
  {
    id: 'ios.sdk.dependency.missing',
    title: 'Frontegg iOS SDK dependency not detected',
    description: 'Add the Frontegg iOS SDK via Swift Package Manager or CocoaPods.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'build',
  },
  {
    id: 'ios.ats.httpUrl',
    title: 'Non-HTTPS URL in Info.plist without ATS exception',
    description: 'iOS ATS blocks HTTP traffic by default — Frontegg must be HTTPS.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'security',
  },
  {
    id: 'ios.ats.broad-allows',
    title: 'ATS NSAllowsArbitraryLoads is enabled',
    description:
      'Info.plist sets `NSAllowsArbitraryLoads = true`, globally disabling App Transport Security. Even if your Frontegg base URL is HTTPS today, any other library (or future code) using `http://` now bypasses ATS, exposing tokens and auth cookies to plaintext exfiltration. Apple may also flag this during App Store review.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'security',
    troubleshooting:
      'Remove `NSAllowsArbitraryLoads` from Info.plist (or set to `false`). If you have a specific host that must be reached over HTTP (e.g. a local mock server), add a narrow `NSExceptionDomains` entry for that host only. Never ship `NSAllowsArbitraryLoads = true` in a production build.',
    docAnchor:
      'https://github.com/frontegg/frontegg-ios-swift/blob/master/demo/demo/Info.plist',
  },
  {
    id: 'ios.frontegg.plist.empty',
    title: 'Frontegg config plist is empty / incomplete',
    description:
      'Your Frontegg.plist file exists but is missing the required `baseUrl` and `clientId` keys. The Frontegg iOS SDK reads these from the main bundle at startup; without them, the SDK cannot reach your tenant and every auth call fails before it leaves the device.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'init',
    troubleshooting:
      'Add a `<dict>` block to Frontegg.plist with at minimum `<key>baseUrl</key><string>https://app-<your-subdomain>.frontegg.com</string>` and `<key>clientId</key><string><your-app-client-id></string>`. Optionally include `<key>applicationId</key><string><your-app-id></string>` if you target a specific Application. Values come from your Frontegg portal: Applications → <your app> → Settings.',
    docAnchor:
      'https://github.com/frontegg/frontegg-ios-swift/blob/master/demo/demo/Frontegg.plist',
  },
  {
    id: 'ios.init.missing',
    title: 'FronteggAuth init call missing',
    description:
      'No FronteggAuth/FronteggApp bootstrap call was found in any Swift source. Without it, `FronteggAuth.shared` is never initialized, the SDK does not install its URL handler, and views that use `@EnvironmentObject var fronteggAuth: FronteggAuth` crash at runtime with a missing-EnvironmentObject error.',
    severity: 'critical',
    platforms: ['ios'],
    flow: 'init',
    troubleshooting:
      'Pick the right pattern for your app:\n\n• **SwiftUI (recommended):** add `import FronteggSwift` to your `@main` App file, and wrap your root scene with `FronteggWrapper { YourRootView() }`. The wrapper installs the environment, the loader, and `onOpenURL` handling for redirect callbacks.\n\n• **UIKit:** in `AppDelegate.application(_:didFinishLaunchingWithOptions:)`, call `FronteggApp.shared.didFinishLaunchingWithOptions()` and return `true`. Also implement `application(_:open:options:)` and forward to `FronteggApp.shared.application(open:)`.\n\nNote: the analyzer may attribute this finding to an unrelated Swift file (e.g. test helpers) as the reported path — the missing-init condition is project-wide, not file-specific.',
    docAnchor:
      'https://github.com/frontegg/frontegg-ios-swift/blob/master/demo-application-id/demo-application-id/demo_application_idApp.swift',
  },

  // ----- Flutter -----
  {
    id: 'flutter.dependency.missing',
    title: 'frontegg_flutter not in pubspec.yaml',
    description: 'Add frontegg_flutter under dependencies in pubspec.yaml.',
    severity: 'critical',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'build',
  },
  {
    id: 'flutter.dependency.versionDrift',
    title: 'frontegg_flutter version drift',
    description: 'User project pins a different version than the canonical repo.',
    severity: 'low',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'build',
  },
  {
    id: 'flutter.init.missing',
    title: 'FronteggApp.init not called in main.dart',
    description: 'Initialize Frontegg before runApp() to enable auth flows.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'init',
  },

  // ----- React Native -----
  {
    id: 'rn.dependency.missing',
    title: '@frontegg/react-native not in package.json',
    description: 'Install @frontegg/react-native and run pod install.',
    severity: 'critical',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'build',
  },
  {
    id: 'rn.dependency.versionDrift',
    title: '@frontegg/react-native version drift',
    description: 'User project pins a different version than the canonical repo.',
    severity: 'low',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'build',
  },
  {
    id: 'rn.android.intentFilter.missing',
    title: 'RN Android intent-filter missing',
    description: 'Deep link intent-filter must exist under MainActivity in android/app manifest.',
    severity: 'high',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'deep-link',
  },
  {
    id: 'rn.android.internetPermission.missing',
    title: 'RN Android INTERNET permission missing',
    description: 'Android shell needs INTERNET permission for SDK network calls.',
    severity: 'high',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'build',
  },
  {
    id: 'rn.ios.urlTypes.missing',
    title: 'RN iOS CFBundleURLTypes missing',
    description: 'Add URL scheme to ios/<App>/Info.plist so OAuth redirect reaches the app.',
    severity: 'high',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'deep-link',
  },
  {
    id: 'rn.ios.podfile.useFrameworks.missing',
    title: 'RN iOS Podfile missing use_frameworks!',
    description: 'Swift pods require use_frameworks! in the target block.',
    severity: 'medium',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'build',
  },
  {
    id: 'rn.init.missing',
    title: 'FronteggWrapper not found in App entry',
    description: 'Wrap the app root with <FronteggWrapper> so auth flows mount.',
    severity: 'high',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'init',
  },

  // ----- Ionic / Capacitor -----
  {
    id: 'ionic.dependency.missing',
    title: '@frontegg/ionic-capacitor not in package.json',
    description: 'Install the plugin and run npx cap sync.',
    severity: 'critical',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'build',
  },
  {
    id: 'ionic.dependency.versionDrift',
    title: '@frontegg/ionic-capacitor version drift',
    description: 'User project pins a different version than the canonical repo.',
    severity: 'low',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'build',
  },
  {
    id: 'ionic.capacitorConfig.missing',
    title: 'capacitor.config file missing',
    description: 'Capacitor requires a config file at project root.',
    severity: 'high',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'build',
  },
  {
    id: 'ionic.capacitorConfig.plugin.missing',
    title: 'FronteggNative plugin block missing from capacitor config',
    description: 'Add plugins.FronteggNative with baseUrl/clientId/applicationId.',
    severity: 'high',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'init',
  },
  {
    id: 'ionic.android.intentFilter.missing',
    title: 'Ionic Android intent-filter missing',
    description: 'android/app manifest needs VIEW intent-filter for OAuth redirect.',
    severity: 'high',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'deep-link',
  },
  {
    id: 'ionic.ios.urlTypes.missing',
    title: 'Ionic iOS CFBundleURLTypes missing',
    description: 'ios/App/App/Info.plist needs CFBundleURLTypes with your scheme.',
    severity: 'high',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'deep-link',
  },

  // ----- Advisory rules sourced from recurring #mobile-sdks support patterns -----
  // These are knowledge entries surfaced via list_rules / explain_finding so the
  // LLM can recognize the symptom even when static detection cannot fire.
  {
    id: 'common.hostedLogin.webview.connectivity',
    title: 'Hosted Login WebView shows generic "no connectivity" page',
    description:
      'Customers want to detect WebView load failures and render their own offline UI instead of the built-in Frontegg connectivity page.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Listen for WebView navigation errors (Android: WebViewClient.onReceivedError; iOS: WKNavigationDelegate didFailProvisionalNavigation) before rendering. On Android, also confirm cleartext is OFF and the WebView is not blocked by a proxy. Recovery after offline→online requires manually calling reload() — the WebView does not auto-retry.',
  },
  {
    id: 'common.deepLink.coldStart.appNotInitialized',
    title: 'Deep link before init crashes with app_must_be_initialized',
    description:
      'Tapping a Frontegg deep link (e.g. forgot-password, magic link) while the app is closed crashes with `frontegg.error.app_must_be_initialized` because the link launches the activity before FronteggApp.init runs.',
    severity: 'high',
    platforms: ['common'],
    flow: 'init',
    troubleshooting:
      'Initialize Frontegg synchronously at the very top of your app entry (Android: Application.onCreate; iOS: AppDelegate.didFinishLaunchingWithOptions; Flutter: main() before runApp; RN: index.js before AppRegistry; Ionic: app.module before bootstrap). Never gate init on a network call or async config fetch. Confirmed crash signature seen in Flutter + native cold-start flows.',
  },
  {
    id: 'common.refreshToken.unknownHost.fatal',
    title: 'Refresh token throws fatal UnknownHostException',
    description:
      'SDK throws an unhandled fatal exception when the device is offline or DNS fails during a token refresh, crashing the app in production.',
    severity: 'critical',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Wrap refresh-token calls so transient network errors (UnknownHostException, NSURLErrorNotConnectedToInternet) degrade to "session expired" instead of crashing. Pin the SDK to the latest patch — recent Android/iOS releases catch this internally. Watch for the crash trace mentioning frontegg refresh + UnknownHost.',
  },
  {
    id: 'ios.socialLogin.google.redirectFailure',
    title: 'Google social login fails to redirect back to iOS app',
    description:
      'Google OAuth completes in Safari/SFSafariViewController but never returns to the app — observed as tenant-specific in production.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Verify the Frontegg tenant has the correct iOS bundle ID + redirect URI registered for the Google provider. Confirm Associated Domains entitlement contains `applinks:<your-frontegg-subdomain>` and that the app handles the universal-link callback. Check console for "no matching application" — that indicates AASA file misconfiguration on the Frontegg side.',
  },
  {
    id: 'common.redirectUri.fullUrl.misconfigured',
    title: 'redirectUri configured as full URL instead of associated domain',
    description:
      'Customers set redirectUri to a full https URL; hosted-login then routes through the browser instead of returning to the app via universal links.',
    severity: 'high',
    platforms: ['common'],
    flow: 'deep-link',
    troubleshooting:
      'redirectUri should be the app scheme/host that matches your Associated Domains entitlement (iOS) or App Links autoVerify (Android), not the full https://app-xxx.frontegg.com URL. Re-check the SDK init call and remove any hardcoded https redirect.',
  },
  {
    id: 'android.hostedLogin.offline.recoveryFails',
    title: 'Hosted Login on Android does not recover after offline → online',
    description:
      'After the device loses connectivity inside the hosted login WebView, reconnecting does not recover the page even though the network is back.',
    severity: 'medium',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'WebView does not auto-reload on network restore. Hook ConnectivityManager.NetworkCallback.onAvailable and call webView.reload() (or re-launch the FronteggAuth flow) when the user comes back online.',
  },
  {
    id: 'common.socialLogin.cancel.reload',
    title: 'Cancelling social login triggers full hosted-login reload',
    description:
      'Pressing back/cancel during social login causes the entire hosted login page to reload, hurting perceived performance.',
    severity: 'low',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Upgrade the SDK to a version that includes the "no reload on social login cancel" fix. Confirm by cancelling Google/Apple flow — the form should remain interactive without a flash.',
  },
  {
    id: 'common.platform.notSupported.dotnetMaui',
    title: '.NET MAUI is not an officially supported Frontegg mobile SDK target',
    description:
      'Customers asking for SSO in .NET MAUI apps need a workaround — Frontegg does not ship a MAUI SDK.',
    severity: 'low',
    platforms: ['common'],
    flow: 'other',
    troubleshooting:
      'Recommended workaround: open Frontegg hosted login in a system browser (WebAuthenticator on MAUI) and handle the redirect URI back into the app. Treat tokens as opaque — refresh via the standard /oauth/token endpoint. There is no native MAUI binding today.',
  },
  // ===== Config-flag advisory rules — sourced from canonical SDK READMEs / source =====
  // These never auto-fire; they live in the catalog so list_rules + explain_finding
  // can surface them when a user asks "how do I enable X" or describes a flag-shaped problem.

  // ----- Android Kotlin config flags -----
  {
    id: 'android.config.useAssetsLinks',
    title: 'Android: useAssetsLinks flag for App Links deep linking',
    description:
      'FRONTEGG_USE_ASSETS_LINKS (BuildConfig) / useAssetsLinks (FronteggApp.init) toggles App Links deep linking. Default false.',
    severity: 'low',
    platforms: ['android'],
    flow: 'deep-link',
    troubleshooting:
      'Set buildConfigField "boolean", "FRONTEGG_USE_ASSETS_LINKS", "true" AND register your App Link via POST /vendors/resources/associated-domains/v1/android in the Frontegg portal. Without server-side registration the assetlinks.json will not validate.',
  },
  {
    id: 'android.config.useChromeCustomTabs',
    title: 'Android: useChromeCustomTabs flag',
    description:
      'FRONTEGG_USE_CHROME_CUSTOM_TABS / useChromeCustomTabs switches OAuth flow from internal WebView to Chrome Custom Tabs. Default false.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Set when you need cookie sharing with the system browser or want to escape WebView quirks. Combine with FRONTEGG_USE_ASSETS_LINKS for the cleanest UX.',
  },
  {
    id: 'android.config.disableAutoRefresh',
    title: 'Android: FRONTEGG_DISABLE_AUTO_REFRESH flag',
    description:
      'Disables the SDK\'s built-in token refresh service. Default false.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Enable when your app manages refresh on its own. Note: this kills the WorkManager-based refresh — you must call FronteggAuth.refreshTokenIfNeeded() manually on cold start and resume.',
  },
  {
    id: 'android.config.enableOfflineMode',
    title: 'Android: enableOfflineMode flag',
    description:
      'enableOfflineMode (FronteggApp.init) lets the SDK keep the user signed in when the device is offline instead of nulling tokens. Default false.',
    severity: 'medium',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Strongly recommended for apps used in low-connectivity scenarios (in-flight, field, transit). Pair with networkMonitoringIntervalSeconds. Maps to the long-standing cold-start-offline class of bugs (FR-22063).',
  },
  {
    id: 'android.config.networkMonitoringIntervalSeconds',
    title: 'Android: networkMonitoringIntervalSeconds (default 10s)',
    description:
      'How often the SDK probes connectivity. Default 10 seconds.',
    severity: 'low',
    platforms: ['android'],
    flow: 'build',
    troubleshooting:
      'Increase (e.g. 60) for data-constrained apps to reduce /fe-auth/test traffic. Sister setting to the iOS networkMonitoringInterval and the SkyPath bug (FR-23030).',
  },
  {
    id: 'android.config.enableSessionPerTenant',
    title: 'Android: FRONTEGG_ENABLE_SESSION_PER_TENANT flag',
    description:
      'Enables independent sessions per tenant — each tenant has its own access/refresh token slot. Default true via BuildConfig, false via init.',
    severity: 'medium',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Required to prevent the "web tenant switch leaks permissions to mobile" class of bugs (FR-22045). Requires Android SDK 1.3.24+.',
  },
  {
    id: 'android.config.entitlementsEnabled',
    title: 'Android: FRONTEGG_ENTITLEMENTS_ENABLED flag',
    description:
      'Loads Frontegg entitlements (feature flags + permissions) on login. Default true.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Disable only if you do not use Frontegg entitlements — it adds one network call on login.',
  },
  {
    id: 'android.config.mainActivityClass',
    title: 'Android: mainActivityClass param for post-auth navigation',
    description:
      'mainActivityClass (FronteggApp.init) specifies which Activity to navigate to after a successful login.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Set this to your post-login Activity class (e.g. MainActivity::class.java). Without it, the SDK falls back to launchIntentForPackage which can land on the splash screen.',
  },
  {
    id: 'android.config.useDiskCacheWebview',
    title: 'Android: useDiskCacheWebview flag',
    description:
      'Persists WebView disk cache across launches. Default false.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Enable for faster repeat hosted-login loads. Disable if you see stale-content issues after Frontegg branding changes.',
  },
  {
    id: 'android.config.tenantResolver.customLoginPerTenant',
    title: 'Android: tenantResolver param for custom login per tenant',
    description:
      'tenantResolver (FronteggApp.init) + FRONTEGG_ORGANIZATION enables custom login per tenant alias.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Once enabled, switchTenant between custom-login accounts is not supported — design your UX accordingly.',
  },
  {
    id: 'android.config.useLegacySocialLoginFlow',
    title: 'Android: useLegacySocialLoginFlow flag',
    description:
      'Reverts to the pre-1.3 social login flow. Default false.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Only set true as a temporary mitigation for a social-login regression on the new flow. File a bug if you need this.',
  },
  {
    id: 'android.config.embeddedVsHostedActivity',
    title: 'Android: declare EmbeddedAuthActivity OR HostedAuthActivity in manifest',
    description:
      'The SDK picks embedded vs hosted login based on which Activity you declare in AndroidManifest.xml.',
    severity: 'high',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Declare exactly one of <activity android:name="com.frontegg.android.EmbeddedAuthActivity"/> or HostedAuthActivity. Declaring both, or neither, causes silent fallback or crash on login launch.',
  },
  {
    id: 'android.config.autoreconnectMetadata',
    title: 'Android: frontegg.autoreconnect.enabled / debounceMs metadata',
    description:
      'AndroidManifest <meta-data> keys frontegg.autoreconnect.enabled (default true) and frontegg.autoreconnect.debounceMs (default 500ms) control reconnect-on-foreground behavior.',
    severity: 'low',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Set frontegg.autoreconnect.enabled=false if reconnect storms cause duplicate refresh calls (related to FR-24076).',
  },

  // ----- iOS Swift Frontegg.plist flags -----
  {
    id: 'ios.config.embeddedMode',
    title: 'iOS: embeddedMode plist key',
    description:
      'embeddedMode (Frontegg.plist) chooses embedded ASWebAuthenticationSession vs hosted SFSafariViewController flow. Default true.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Set false for full hosted-login experience with SafariView. embeddedMode=true is required for the in-app social-login UX. Ref: FR-22949 Google Safari session bug.',
  },
  {
    id: 'ios.config.lateInit',
    title: 'iOS: lateInit plist key (required for Capacitor + Flutter+SPM)',
    description:
      'lateInit delays Frontegg startup until the native bridge is ready. Default false.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'init',
    troubleshooting:
      'MUST be true in Ionic/Capacitor apps and modern Flutter+SPM apps. Without it, FronteggAuth.shared init runs before the JS/Dart engine is up and silently no-ops.',
  },
  {
    id: 'ios.config.keepUserLoggedInAfterReinstall',
    title: 'iOS: keepUserLoggedInAfterReinstall plist key',
    description:
      'Persists tokens in Keychain across app reinstalls. Default false.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Use with Keychain Sharing capability + a stable access group. Disabling fixes "stuck logged in" support cases after uninstall.',
  },
  {
    id: 'ios.config.entitlementsEnabled',
    title: 'iOS: entitlementsEnabled plist key',
    description:
      'Loads Frontegg entitlements (feature flags + permissions) on login. Default false on iOS.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Enable if your app reads from Frontegg entitlements. Disabled by default to save a network call.',
  },
  {
    id: 'ios.config.enableSessionPerTenant',
    title: 'iOS: enableSessionPerTenant plist key',
    description:
      'Independent token slots per tenant. Default false.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Enable to prevent cross-tenant permission bleed (FR-22045 / FR-22800). Requires FronteggSwift 1.2.79+.',
  },
  {
    id: 'ios.config.enableOfflineMode',
    title: 'iOS: enableOfflineMode plist key',
    description:
      'Lets the SDK preserve auth state offline. Default false.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Enable for in-flight / field apps. Mitigates the white-screen-on-offline class (FR-22465).',
  },
  {
    id: 'ios.config.networkMonitoringInterval',
    title: 'iOS: networkMonitoringInterval plist key (default 10s)',
    description:
      'Connectivity probe cadence. Default 10 seconds.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'build',
    troubleshooting:
      'Increase (e.g. 60) on data-constrained devices. Directly addresses SkyPath /fe-auth/test polling (FR-23030).',
  },
  {
    id: 'ios.config.useLegacySocialLoginFlow',
    title: 'iOS: useLegacySocialLoginFlow plist key',
    description:
      'Reverts to legacy social-login flow. Default false.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Temporary mitigation for new-flow regressions (e.g. PKCE / Microsoft / Google). File a bug if needed.',
  },
  {
    id: 'ios.config.useAsWebAuthenticationForAppleLogin',
    title: 'iOS: useAsWebAuthenticationForAppleLogin plist key',
    description:
      'Uses ASWebAuthenticationSession for Sign in with Apple instead of native flow. Default true.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Set false to use the native Apple Sign-In sheet. Note: native flow needs Apple Sign-In capability + Frontegg portal Apple provider config.',
  },
  {
    id: 'ios.config.shouldSuggestSavePassword',
    title: 'iOS: shouldSuggestSavePassword plist key',
    description:
      'Triggers iCloud Keychain save prompt after password login. Default false.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Enable to integrate with iCloud Keychain autofill. Combine with Associated Domains + webcredentials entitlement.',
  },
  {
    id: 'ios.config.logLevel',
    title: 'iOS: logLevel plist key',
    description:
      'Frontegg SDK log verbosity. Default warn. Values: trace/debug/info/warn/error.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'build',
    troubleshooting:
      'Set debug or trace when troubleshooting auth flows; ship release builds with warn or error to avoid token leakage in console.',
  },
  {
    id: 'ios.config.keychainService',
    title: 'iOS: keychainService plist key',
    description:
      'Custom Keychain service name. Default "frontegg".',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Override only if you need namespacing across multiple Frontegg apps on the same device. Changing it after release invalidates existing sessions.',
  },
  {
    id: 'ios.config.handleLoginWithCustomSSO',
    title: 'iOS: handleLoginWithCustomSSO plist key',
    description:
      'Routes custom-SSO logins through the SDK. Default false.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Enable to support tenants with custom IDPs configured in Frontegg.',
  },
  {
    id: 'ios.config.loginOrganizationAlias',
    title: 'iOS: loginOrganizationAlias plist key',
    description:
      'Pins login to a specific organization (custom login per tenant).',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Set when each app build is dedicated to one tenant. Note: switchTenant is unsupported once this is set.',
  },
  {
    id: 'ios.config.cookieRegex',
    title: 'iOS: cookieRegex / deleteCookieForHostOnly plist keys',
    description:
      'Controls which cookies the SDK manages and whether host-only cookies get cleared on logout.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Override only if your hosted login uses a non-default subdomain pattern.',
  },

  // ----- Flutter -----
  {
    id: 'flutter.config.constantsRequired',
    title: 'Flutter: FronteggConstants — baseUrl + clientId required',
    description:
      'Constants must be provided to FronteggApp.init() before runApp().',
    severity: 'critical',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'init',
    troubleshooting:
      'Hardcoding constants in main.dart works but they should usually be loaded from --dart-define for per-environment builds.',
  },
  {
    id: 'flutter.config.spmRequiredOniOS',
    title: 'Flutter: SPM required for iOS on Flutter 3.41+',
    description:
      'Newer Flutter no longer ships the CocoaPods fallback for FronteggSwift; you must enable Swift Package Manager.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'build',
    troubleshooting:
      'Run `flutter config --enable-swift-package-manager` then `cd ios && pod install` once. Without SPM, frontegg_flutter will fail to link on iOS builds.',
  },
  {
    id: 'flutter.config.iosLateInitRequired',
    title: 'Flutter iOS: Frontegg.plist lateInit must be true',
    description:
      'Flutter loads Frontegg via the platform channel after the engine boots — lateInit guards against premature init.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'init',
    troubleshooting:
      'Add <key>lateInit</key><true/> to ios/Runner/Frontegg.plist. Skipping this is the most common Flutter+iOS init bug.',
  },
  {
    id: 'flutter.config.sessionPerTenantVersionFloor',
    title: 'Flutter: enableSessionPerTenant requires native version floors',
    description:
      'Per-tenant sessions need Android SDK 1.3.24+ and FronteggSwift 1.2.79+.',
    severity: 'medium',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'build',
    troubleshooting:
      'Bump the native dependency in android/build.gradle and ios/frontegg_flutter.podspec before flipping the flag.',
  },

  // ----- React Native -----
  {
    id: 'rn.config.expoGoUnsupported',
    title: 'React Native: Frontegg is incompatible with Expo Go',
    description:
      'The SDK requires native modules; Expo Go cannot load them.',
    severity: 'high',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'build',
    troubleshooting:
      'Use a custom dev client (`npx expo prebuild` + `expo run:ios|android`) or a bare RN project.',
  },
  {
    id: 'rn.config.handleOpenUrlAppDelegate',
    title: 'React Native iOS: AppDelegate.swift must call FronteggAuth.shared.handleOpenUrl',
    description:
      'iOS deep-link callbacks for OAuth do not reach the SDK without the AppDelegate hook.',
    severity: 'high',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'deep-link',
    troubleshooting:
      'Add `if FronteggAuth.shared.handleOpenUrl(url) { return true }` to both `application(_:open:options:)` and `application(_:continue:restorationHandler:)`.',
  },
  {
    id: 'rn.config.podInstallRequired',
    title: 'React Native iOS: pod install must run after package add',
    description:
      'Native module won\'t link until pods are installed.',
    severity: 'critical',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'build',
    troubleshooting:
      'Run `cd ios && pod install` (or `npx pod-install`) after `npm install @frontegg/react-native`. Re-run after every native dependency bump.',
  },
  {
    id: 'rn.config.fronteggWrapperRequired',
    title: 'React Native: <FronteggWrapper> must wrap the app root',
    description:
      'Without FronteggWrapper at the top of the tree, hooks like useAuth return undefined.',
    severity: 'high',
    platforms: ['react-native'],
    sdk: ['react-native'],
    flow: 'init',
    troubleshooting:
      'Wrap App.tsx in <FronteggWrapper>{...}</FronteggWrapper>. Place above NavigationContainer so navigation can react to auth state.',
  },

  // ----- Ionic / Capacitor -----
  {
    id: 'ionic.config.fronteggServiceLogLevel',
    title: 'Ionic: FronteggService logLevel param',
    description:
      'Only TS-side init param: `new FronteggService({ logLevel: LogLevel.INFO })`.',
    severity: 'low',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'init',
    troubleshooting:
      'Use LogLevel.DEBUG when troubleshooting auth, LogLevel.WARN in production.',
  },
  {
    id: 'ionic.config.lateInitRequired',
    title: 'Ionic iOS: Frontegg.plist lateInit MUST be true',
    description:
      'Capacitor bridges to native after the WKWebView boots; without lateInit the iOS SDK initializes too early and fails.',
    severity: 'critical',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'init',
    troubleshooting:
      'Add <key>lateInit</key><true/> to ios/App/App/Frontegg.plist. This is the #1 Ionic setup mistake.',
  },
  {
    id: 'ionic.config.codeSigningAllowedPodfile',
    title: 'Ionic iOS: Podfile must allow code signing',
    description:
      'Pods need CODE_SIGNING_ALLOWED to build under Capacitor.',
    severity: 'medium',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'build',
    troubleshooting:
      'Add a post_install hook in ios/App/Podfile setting CODE_SIGNING_ALLOWED=YES on every target.',
  },
  {
    id: 'ionic.config.minSdk26',
    title: 'Ionic Android: minSdkVersion >= 26',
    description:
      'frontegg-ionic-capacitor requires Android 8.0 (API 26).',
    severity: 'high',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'build',
    troubleshooting:
      'Set minSdkVersion = 26 in android/variables.gradle. Builds against API < 26 will fail at link time.',
  },
  {
    id: 'ionic.config.appDelegateHandleOpenUrl',
    title: 'Ionic iOS: AppDelegate must forward openURL to FronteggAuth',
    description:
      'Capacitor\'s default AppDelegate does not call FronteggAuth.shared.handleOpenUrl — deep links are dropped.',
    severity: 'high',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'deep-link',
    troubleshooting:
      'Edit ios/App/App/AppDelegate.swift to call FronteggAuth.shared.handleOpenUrl(url) in both application:openURL: and application:continueUserActivity: before delegating to ApplicationDelegateProxy.',
  },
  {
    id: 'ionic.config.webPlatformUnsupported',
    title: 'Ionic web platform: Frontegg native plugin throws "not implemented"',
    description:
      'Calls into FronteggService from a browser context throw — there is no web fallback.',
    severity: 'medium',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'build',
    troubleshooting:
      'Gate Frontegg calls behind Capacitor.isNativePlatform(). For web builds use @frontegg/react instead.',
  },

  // ----- Bugs_tracker.csv recurring patterns -----
  {
    id: 'ionic.dependency.restApiVersionConflict',
    title: '@frontegg/rest-api version conflict between web + ionic-capacitor',
    description:
      'Using @frontegg/react alongside @frontegg/ionic-capacitor causes npm to hoist @frontegg/rest-api 3.x, breaking the web build with errors like "setCdnUrl is not a function".',
    severity: 'medium',
    platforms: ['ionic-capacitor'],
    sdk: ['ionic-capacitor'],
    flow: 'build',
    troubleshooting:
      'Pin @frontegg/rest-api in package.json overrides/resolutions to the version expected by @frontegg/react (7.x) and re-run npm install. Verify with `npm ls @frontegg/rest-api` — only one copy should be hoisted. Ref: FR-23397.',
  },
  {
    id: 'flutter.ios.embeddedMode.googleSafariSession',
    title: 'Flutter iOS Google login fails with embeddedMode + active Safari session',
    description:
      'embeddedMode:true Google OAuth does not redirect back to the app when the user already has an active Google session in Safari.',
    severity: 'medium',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Set embeddedMode:false for Google in Flutter iOS until fixed, OR instruct users to sign out of Google in Safari first. Ref: FR-22949.',
  },
  {
    id: 'ios.socialLogin.pkceMismatch',
    title: 'PKCE code_verifier mismatch on Microsoft/Google social login (iOS)',
    description:
      'Social login fails with "cannot resolve user profile" — the PKCE code_verifier saved at /authorize is not the one sent to /token, often because session storage was cleared between steps.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Verify Frontegg SDK persists pkce state across the SFSafariViewController callback. Pin SDK to a release that includes the PKCE persistence fix. If still reproducible, capture network logs and check the code_verifier hash against /authorize. Ref: FR-23008.',
  },
  {
    id: 'ios.network.feAuthTestPolling',
    title: 'iOS SDK polls /fe-auth/test every 10s — high data usage',
    description:
      'Frontegg iOS SDK runs a connectivity probe to /fe-auth/test on a 10-second interval, consuming bandwidth on data-constrained devices.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'build',
    troubleshooting:
      'Upgrade to a Swift SDK version that exposes a flag to disable the connectivity probe after authentication, or override the polling interval. Customers on metered networks should disable it post-login. Ref: FR-23030 (SkyPath).',
  },
  {
    id: 'ios.refresh.unexpectedLogouts',
    title: 'Swift SDK unexpected logouts during token refresh',
    description:
      'Swift SDK 1.2.5x intermittently logs the user out on refresh — typically when refresh hits 401 once and the SDK does not retry with a fresh token.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Upgrade past 1.2.53. Add session-event logs and confirm refresh isn\'t fired in parallel from multiple call sites. Ref: FR-23062, FR-22756, FR-23835.',
  },
  {
    id: 'ios.isOfflineMode.unreliable',
    title: 'Swift SDK isOfflineMode flag does not reflect real connectivity',
    description:
      'isOfflineMode boolean stays stale or returns false even when the device has no network — causes UX glitches like "white screen of death".',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Do not rely solely on isOfflineMode — combine it with NWPathMonitor or Reachability. Pin to an SDK version that wires NWPathMonitor into the flag. Ref: FR-23074.',
  },
  {
    id: 'common.accessToken.staleAfterTenantSwitch',
    title: 'accessToken observable not updated after switch tenant / new login',
    description:
      'After switchTenant or new login, the accessToken stream emits the previous token even though the operation succeeded. Intermittent.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Always re-read accessToken from the SDK after awaiting switchTenant; do not rely on a single stream subscription. Upgrade past the version where the observable was wired to the wrong source. Ref: FR-23182.',
  },
  {
    id: 'flutter.dependency.iosNativeDrift',
    title: 'Flutter plugin pinned to outdated FronteggSwift native dependency',
    description:
      'frontegg_flutter pulls a stale FronteggSwift version, missing recent native fixes.',
    severity: 'medium',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'build',
    troubleshooting:
      'Check the Flutter plugin\'s ios/frontegg_flutter.podspec for the FronteggSwift version. Bump it to match the latest frontegg-ios-swift release. Ref: FR-23219.',
  },
  {
    id: 'flutter.ios.authStateClearedOnRestart',
    title: 'Flutter iOS clears auth state on app restart',
    description:
      'Authentication state is wiped when the iOS app restarts (Flutter 1.0.30) — typically Keychain access group missing or sandbox mismatch.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Verify Keychain Sharing capability is enabled and the access group matches across app + extensions. Check that the app is not restoring from a snapshot with a different bundle ID. Ref: FR-23317.',
  },
  {
    id: 'android.exactAlarms.permissionRestriction',
    title: 'Android 14+ blocks SCHEDULE_EXACT_ALARM, breaking session refresh',
    description:
      'Frontegg Kotlin SDK uses exact alarms for the session refresh timer; on Android 14+ this requires SCHEDULE_EXACT_ALARM/USE_EXACT_ALARM permission.',
    severity: 'medium',
    platforms: ['android'],
    flow: 'build',
    troubleshooting:
      'Add <uses-permission android:name="android.permission.USE_EXACT_ALARM"/> to AndroidManifest.xml or migrate the SDK\'s alarm scheduling to inexact + WorkManager. Ref: FR-23321.',
  },
  {
    id: 'android.dozeMode.refreshFailures',
    title: 'Android Doze Mode pauses Frontegg refresh service',
    description:
      'On modern Android, Doze Mode suspends background services — Frontegg token refresh stalls, leaving inconsistent session state.',
    severity: 'high',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Move refresh to WorkManager with setExpedited or trigger refresh on app foreground (Lifecycle.Event.ON_RESUME). Do not rely on a long-running service. Ref: FR-22824.',
  },
  {
    id: 'flutter.socialLogin.redirectUriRegression',
    title: 'Flutter SDK 1.0.32+ social login regression — "redirect uri wasnt found"',
    description:
      'After upgrading Flutter SDK to 1.0.32, social logins fail with "redirect_uri was not found" even though redirect URI is configured correctly.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Roll back to 1.0.31 or upgrade to a release containing the fix. Verify redirect URI in Frontegg portal matches what the SDK actually sends (capture with Charles). Ref: FR-23364.',
  },
  {
    id: 'flutter.microsoftLogin.regression',
    title: 'Flutter Microsoft login regression after 1.0.20',
    description:
      'Microsoft social login that worked on Flutter SDK 1.0.20 fails on 1.0.32/1.0.33 with the same credentials.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Pin to 1.0.20 until fixed, OR upgrade to a release with the Microsoft tenant fix. Ref: FR-23622.',
  },
  {
    id: 'ios.swift.webviewFallback.blocking',
    title: 'Swift SDK falls back to WebView, blocking users from entering app',
    description:
      'Under certain conditions Swift SDK falls back to a blocking WebView instead of returning to the app post-login.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Confirm Associated Domains entitlement is correctly configured and the AASA file is reachable. Verify your bundle ID matches the redirect target. Ref: FR-23448.',
  },
  {
    id: 'flutter.directLogin.androidDoubleLoginLoop',
    title: 'Flutter directLogin Android double-login loop',
    description:
      'After directLogin() the user has to log in twice — first attempt returns to the login form, second succeeds.',
    severity: 'medium',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Upgrade past the regression release. Capture logs of the first failed attempt — typically the SDK is dropping the auth code on activity recreation. Ref: FR-23832.',
  },
  {
    id: 'flutter.directLogin.iosRememberMfaIgnored',
    title: 'Flutter iOS directLogin ignores Remember MFA option',
    description:
      'iOS directLogin flow does not honor the "remember this device" MFA option — user is re-prompted every login.',
    severity: 'medium',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Verify the device fingerprint cookie persists across sessions in the iOS WKWebView storage. Ref: FR-23832.',
  },
  {
    id: 'android.kotlin.loginCallbackNullToken',
    title: 'Android Kotlin login callback fires before token exchange completes',
    description:
      'Hosted Login callback returns null token because the SDK invokes the callback before the /token exchange has finished.',
    severity: 'medium',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Wait for the accessToken Flow to emit non-null instead of acting inside the login callback. Pin to an SDK release where the callback fires post-exchange. Ref: FR-23977.',
  },
  {
    id: 'flutter.android.duplicateRefreshOnReconnect',
    title: 'Flutter Android fires duplicate refresh requests after reconnect, causing logout',
    description:
      'After reconnecting to network, Flutter SDK calls refresh twice with the same refresh token — first 401, second 200 — but the SDK keeps the failed-state and logs the user out.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Coalesce refresh calls behind a single in-flight promise. Upgrade past Flutter SDK 1.0.38. Customers should not call frontegg.refreshToken manually. Ref: FR-24076.',
  },
  {
    id: 'flutter.background.duplicateRefreshOnPush',
    title: 'Flutter background push triggers duplicate refresh, refresh failures',
    description:
      'FCM/APNs background pushes wake the Flutter app and trigger simultaneous duplicate refresh requests.',
    severity: 'medium',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Same root cause as FR-24076 — refresh must be coalesced. Avoid calling Frontegg APIs from background isolates without serialization. Ref: FR-24094.',
  },
  {
    id: 'flutter.lowConnectivity.logouts',
    title: 'Flutter logs users out under low-connectivity conditions',
    description:
      'On flaky networks, Flutter SDK marks the session invalid instead of retrying — logging out iOS + Android users.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Wrap refresh in retry-with-backoff and treat transient network errors as recoverable, not as session-invalid. Ref: FR-24147, FR-24189.',
  },
  {
    id: 'flutter.android.staleAccessToken',
    title: 'Flutter Android serves stale access token after refresh',
    description:
      'In low-connectivity refresh scenarios the SDK returns the old access token to callers even though a new one was just issued.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'auth',
    troubleshooting:
      'Always read accessToken from the live stream after awaiting refresh. Ref: FR-24189.',
  },
  {
    id: 'flutter.android.unreliableInitializing',
    title: 'Flutter Android isAuthenticated/initializing flicker shows login page',
    description:
      'isAuthenticated returns false during init even for an authenticated user, briefly rendering the login screen.',
    severity: 'medium',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'init',
    troubleshooting:
      'Gate UI on (initializing == false && isAuthenticated != null) — never on isAuthenticated alone during cold start. Ref: FR-24259.',
  },
  {
    id: 'android.sdk.offlineMode.notSupported',
    title: 'Android Kotlin SDK lacks offline mode support',
    description:
      'No offline-mode flag on Android SDK — apps that work offline post-login have no clean way to suppress refresh failures.',
    severity: 'medium',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Track FR-24298 for native offline mode. Workaround: gate refresh on Connectivity state and skip when offline. Ref: FR-24298.',
  },
  {
    id: 'ios.swift.handleHostedLoginCallback.forceUnwrap',
    title: 'Swift handleHostedLoginCallback force-unwraps user → potential crash',
    description:
      'FronteggAuth.handleHostedLoginCallback uses user! — crashes if the user object is nil at callback time.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Upgrade to a Swift SDK release that uses safe unwrap. Ref: FR-22419.',
  },
  {
    id: 'android.r8.buildConfigStripped',
    title: 'R8 strips Frontegg BuildConfig fields → ERR_NAME_NOT_RESOLVED',
    description:
      'After upgrading Android SDK to 1.3 with R8 enabled, FRONTEGG_DOMAIN and FRONTEGG_CLIENT_ID get minified out — login fails with ERR_NAME_NOT_RESOLVED.',
    severity: 'high',
    platforms: ['android'],
    flow: 'build',
    troubleshooting:
      'Add ProGuard/R8 keep rules: `-keep class **.BuildConfig { *; }` and explicit Frontegg SDK keeps. Verify with `./gradlew assembleRelease` then `apkanalyzer dex packages`. Ref: tracker entry 8/23/25.',
  },
  {
    id: 'common.tenant.permissionsBleedAcrossPlatforms',
    title: 'Web tenant switch silently changes mobile app permissions',
    description:
      'When the same user logs into Tenant Y on web with a different role, the mobile session for Tenant X starts reflecting Tenant Y permissions.',
    severity: 'high',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Permissions need to be tenant-scoped per session token, not user-scoped. Upgrade to an SDK release that includes session isolation per (device, tenant). Ref: FR-22045, FR-22800.',
  },
  {
    id: 'android.kotlin.coldStartOffline.sessionDestroyed',
    title: 'Android cold-start offline destroys session, logs out on reconnect',
    description:
      'Launching the Android app offline causes the SDK to set null tokens and destroy the session — when network returns, the user is logged out.',
    severity: 'high',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'On init, if network is unavailable, the SDK should keep the existing tokens and retry refresh on connectivity restored — not null them. Pin to a release with the cold-start-offline fix. Ref: FR-22063.',
  },
  {
    id: 'flutter.resetPassword.blankScreen',
    title: 'Flutter reset-password email link redirects to a blank screen',
    description:
      'Reset password email links open a blank fecallback.html — the redirect URI does not deliver the user back into the app.',
    severity: 'high',
    platforms: ['flutter'],
    sdk: ['flutter'],
    flow: 'deep-link',
    troubleshooting:
      'Verify reset-password redirect URI in Frontegg portal points to your app scheme, not the static html callback. Validate AssetLinks/AASA. Ref: FR-22066, Finonex.',
  },
  {
    id: 'android.hostedLogin.openingAppPageStuck',
    title: 'Android Hosted Login redirect stuck on "Opening application" page',
    description:
      'After successful auth, the user lands on an "Opening application" intermediate page where the button is unresponsive — even though AssetLinks are verified.',
    severity: 'high',
    platforms: ['android'],
    flow: 'deep-link',
    troubleshooting:
      'Verify intent-filter is on the Activity Frontegg expects (singleTask launchMode). Check `adb shell pm get-app-links <package>` returns "verified". Ref: FR-21769.',
  },
  {
    id: 'android.kotlin.coldStart.refresh401',
    title: 'Android Kotlin SDK 1.3.1 returns 401 on cold-start refresh',
    description:
      'Intermittent 401 on cold start in low-memory / unstable network conditions on Kotlin 1.3.1; not reproducible on 1.2.48.',
    severity: 'medium',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Roll back to 1.2.48 or upgrade past the cold-start refresh fix. Ref: FR-22135.',
  },
  {
    id: 'common.refreshToken.expiryCheck.api',
    title: 'No public API to inspect refresh token expiry',
    description:
      'Customers want to maintain sessions for the full refresh-token lifetime but have no way to check expiry from the SDK.',
    severity: 'low',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Decode the refresh JWT exp claim manually if exposed, or call /identity/resources/auth/v1/user with the refresh token. Track FR-22335 for native API. Ref: FR-22335.',
  },
  {
    id: 'ios.passkey.authorizationError1004',
    title: 'iOS Passkey ASAuthorizationError Code=1004 in Flutter WebView flow',
    description:
      'Passkey registration/login fails with ASAuthorizationError code 1004 (unknown) inside the Flutter SDK\'s WKWebView.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Verify Associated Domains entitlement includes `webcredentials:` for the Frontegg subdomain. Confirm the AASA file lists the bundle ID. Ref: FR-22454.',
  },
  {
    id: 'ios.directLogin.magicLinkDoubleLogin',
    title: 'iOS directLogin magic link forces double login (WebView stack)',
    description:
      'Magic-link directLogin opens an internal WebView on top of the Custom Tab, requiring the user to log in twice.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Upgrade to a Swift SDK release that suppresses the secondary WebView when directLogin is invoked from a magic link. Ref: FR-22722.',
  },
  {
    id: 'common.tokenRefresh.disableAutomatic',
    title: 'No way to disable automatic token refresh',
    description:
      'Customers using their own refresh strategy want the SDK to stop refreshing on its own.',
    severity: 'low',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Track FR-24332 for the disable flag. Workaround: intercept refresh at the network layer until SDK exposes the option. Ref: FR-24332.',
  },
  {
    id: 'common.tenant.config.providerMismatch',
    title: 'Tenant-specific social provider misconfiguration',
    description:
      'A bug reproduces only for some tenants — usually a provider (Google/Apple/Microsoft) is enabled on the workspace but missing per-tenant client IDs or redirect URIs.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'When a customer reports "only happens for tenant X", first check the Frontegg portal → Authentication → Social Logins for that tenant. Compare client ID, secret, and redirect URI against a working tenant. Tenant-scoped overrides shadow workspace defaults.',
  },

  // ─── CIAM Guide: Social Login ────────────────────────────────────
  {
    id: 'guide.socialLogin.sharedCredentials.production',
    title: 'Using shared OAuth credentials in production',
    description: 'Frontegg shared dev credentials will fail in production; add your own OAuth app credentials.',
    severity: 'high',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Open Frontegg Portal → Login Box → Social Logins. For each enabled provider, switch from "Shared" to "Custom" and enter your own OAuth Client ID + Secret. Shared credentials only work in development environments.',
  },
  {
    id: 'guide.socialLogin.apple.serviceIdVsAppId',
    title: 'Apple Sign In: Service ID vs App ID confusion',
    description: 'The Client ID for Apple Sign In is the Service ID, not the App ID.',
    severity: 'medium',
    platforms: ['ios', 'common'],
    flow: 'auth',
    troubleshooting:
      'In the Frontegg portal Apple login config, enter the Service ID (created in Certificates, Identifiers & Profiles → Identifiers → Service IDs) as the Client ID. Using the App ID instead silently fails authentication.',
  },
  {
    id: 'guide.socialLogin.google.ios.reversedClientId',
    title: 'Google Sign In iOS: missing REVERSED_CLIENT_ID URL scheme',
    description: 'iOS Google login requires the REVERSED_CLIENT_ID added to CFBundleURLSchemes in Info.plist.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Add the reversed client ID (e.g. com.googleusercontent.apps.xxxx) to Info.plist → CFBundleURLTypes → CFBundleURLSchemes. Without it, Safari hangs after Google consent.',
  },
  {
    id: 'guide.socialLogin.google.android.sha1Mismatch',
    title: 'Google Sign In Android: SHA-1 fingerprint mismatch',
    description: 'Debug vs release keystore SHA-1 must both be registered in Google Console.',
    severity: 'high',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Run `./gradlew signingReport` to get SHA-1 for both debug and release. Register both in Google Cloud Console → Credentials → OAuth Client. Mismatch causes "DEVELOPER_ERROR" at runtime.',
  },

  // ─── CIAM Guide: Passkeys ───────────────────────────────────────
  {
    id: 'guide.passkeys.ios.webcredentials.missing',
    title: 'Passkeys: missing webcredentials Associated Domain',
    description: 'iOS passkeys require webcredentials:{domain} in Associated Domains entitlement.',
    severity: 'high',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Add `webcredentials:{YOUR_FRONTEGG_DOMAIN}` to the Associated Domains entitlement in Xcode (in addition to `applinks:` for deep links). Without it, passkey registration silently fails with error 1004.',
  },
  {
    id: 'guide.passkeys.android.assetLinks.missing',
    title: 'Passkeys: missing .well-known/assetlinks.json',
    description: 'Android passkeys require Digital Asset Links JSON on your Frontegg domain.',
    severity: 'high',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Host a `.well-known/assetlinks.json` on your Frontegg domain with your app\'s package name + SHA-256 signing certificate fingerprint. Verify with `adb shell pm get-app-links <package>`. Debug vs release fingerprint mismatch breaks verification.',
  },
  {
    id: 'guide.passkeys.mfaSsoConflict',
    title: 'Passkeys disabled when MFA or SSO is enforced',
    description: 'Passkeys cannot coexist with forced MFA or SSO — they are silently disabled.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'If both passkeys and forced MFA/SSO are enabled in the Frontegg portal, passkeys are silently disabled. Choose one or the other. Check Security → MFA and Authentication → SSO settings.',
  },
  {
    id: 'guide.passkeys.webviewUnsupported',
    title: 'Passkeys may not work in embedded/WebView mode',
    description: 'Platform authenticators may not work in WKWebView/WebView; prefer hosted login for passkeys.',
    severity: 'medium',
    platforms: ['ios', 'android'],
    flow: 'auth',
    troubleshooting:
      'WebView-based login (embedded mode) may not support platform authenticators (Touch ID, Face ID). Use hosted login (Custom Tab on Android, ASWebAuthenticationSession on iOS) for passkey flows.',
  },

  // ─── CIAM Guide: Step-Up Auth ──────────────────────────────────
  {
    id: 'guide.stepUp.refreshTokenLacksAcr',
    title: 'Step-up: refresh tokens lack acr/amr claims',
    description: 'Refresh tokens do not carry acr/amr — user must re-authenticate for step-up, not just refresh.',
    severity: 'high',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'When implementing step-up auth, do NOT rely on token refresh to obtain multi-factor claims. The user must complete a full re-authentication (login flow via WebView/Custom Tab). Check the access token\'s `acr` claim for `http://schemas.openid.net/pape/policies/2007/06/multi-factor`.',
  },
  {
    id: 'guide.stepUp.authTimeNotChecked',
    title: 'Step-up: auth_time not validated',
    description: 'Without checking auth_time, a stale token from hours ago could pass the step-up gate.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'When requiring step-up, also validate the JWT\'s `auth_time` claim against your max_age threshold (e.g. 300 seconds). If auth_time is too old, redirect to re-authentication.',
  },

  // ─── CIAM Guide: Security Rules ────────────────────────────────
  {
    id: 'guide.security.botDetection.webview',
    title: 'Bot detection (reCAPTCHA) may break in mobile WebViews',
    description: 'reCAPTCHA v2/v3 challenges may not render correctly in mobile WebViews.',
    severity: 'medium',
    platforms: ['ios', 'android'],
    flow: 'auth',
    troubleshooting:
      'If using bot detection with reCAPTCHA, test the login flow on real mobile devices. reCAPTCHA challenges may render broken or fail silently in WKWebView/WebView. Consider reCAPTCHA Enterprise with native SDK integration, or use hosted login (Custom Tab/ASWebAuth) which uses the system browser.',
  },
  {
    id: 'guide.security.impossibleTravel.mobileFalsePositive',
    title: 'Impossible Travel: mobile cellular/VPN triggers false positives',
    description: 'Cellular handoff, VPN, and travel cause legitimate IP changes flagged by Impossible Travel.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'For mobile-heavy user bases, set Impossible Travel to "Challenge" instead of "Block" in Frontegg Portal → Security → Security Rules. Cellular network switches and VPN usage cause rapid IP changes that trigger false positives.',
  },
  {
    id: 'guide.security.bruteForce.autoRetry',
    title: 'Brute force lockout triggered by SDK auto-retry',
    description: 'SDK auto-retry of failed token refresh may count as failed login attempts.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'If brute force protection is enabled, ensure your SDK\'s automatic token refresh does not retry failed refreshes in a tight loop — each failure may count as a login attempt. Use exponential backoff.',
  },
  {
    id: 'guide.security.newDevice.reinstallTrigger',
    title: 'New Device detection triggers on iOS app reinstall',
    description: 'Reinstalling the app clears the keychain, making the device appear new.',
    severity: 'low',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'Set `keepUserLoggedInAfterReinstall: true` in Frontegg.plist to persist the device identity in the keychain across reinstalls. Otherwise, every reinstall triggers New Device verification.',
  },

  // ─── CIAM Guide: Hosted vs Embedded ────────────────────────────
  {
    id: 'guide.hosted.embeddedNoCookieSharing',
    title: 'Embedded mode: WKWebView does not share cookies with Safari',
    description: 'SSO sessions from Safari do not carry over to embedded login in WKWebView.',
    severity: 'medium',
    platforms: ['ios'],
    flow: 'auth',
    troubleshooting:
      'WKWebView (used by embedded mode) has its own cookie jar isolated from Safari. If your users sign in via Safari (e.g. SSO), that session is not available in the embedded WebView. Use hosted login (ASWebAuthenticationSession) to share browser cookies.',
  },
  {
    id: 'guide.hosted.redirectUri.fullUrl',
    title: 'Redirect URI must be the full URL, not just the scheme',
    description: 'Using myapp://auth instead of myapp://auth/callback causes redirect failures.',
    severity: 'high',
    platforms: ['common'],
    flow: 'deep-link',
    troubleshooting:
      'Configure the redirect URI with the complete scheme + host + path (e.g. `myapp://auth/callback`). A scheme-only URI like `myapp://` or `myapp://auth` will not match the SDK\'s expected callback path.',
  },
  {
    id: 'guide.hosted.dualActivityDeclaration',
    title: 'Android: declaring both EmbeddedAuthActivity and HostedAuthActivity',
    description: 'Declaring both auth activities in AndroidManifest causes crash or silent fallback.',
    severity: 'high',
    platforms: ['android'],
    flow: 'auth',
    troubleshooting:
      'Choose exactly one of `com.frontegg.android.EmbeddedAuthActivity` or `com.frontegg.android.HostedAuthActivity` in your AndroidManifest.xml. Declaring both causes the SDK to pick one unpredictably, leading to crashes or auth failures.',
  },

  // ─── CIAM Guide: SSO ───────────────────────────────────────────
  {
    id: 'guide.sso.embeddedModeUnsupported',
    title: 'SSO does not work well in embedded/WebView mode',
    description: 'SSO IdP redirects may fail in embedded WebView; use hosted login for SSO.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'SSO requires redirects to the IdP (e.g. Okta, Azure AD) and back — this flow is unreliable in embedded WebViews due to cookie isolation and redirect interception. Use hosted login (Custom Tab/ASWebAuth) for SSO.',
  },
  {
    id: 'guide.sso.multiTenant.missingTenantId',
    title: 'Multi-tenant SSO: missing tenantId in login URL',
    description: 'When a user\'s domain maps to multiple tenants, tenantId is required in the login URL.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'For multi-tenant SSO, pass `?tenantId={tenantId}` in the login URL. Without it, Frontegg may block the login or route to the first-created tenant. Configure the ambiguous domain policy at Frontegg Portal → Authentication → SSO → Multitenancy.',
  },
  {
    id: 'guide.sso.passkeysConflict',
    title: 'SSO + Passkeys: passkeys disabled when SSO is enforced',
    description: 'Enforced SSO disables passkeys — cannot use both simultaneously.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Passkeys are automatically disabled when SSO is enforced for a tenant. If you need both, make SSO optional (not enforced) and let users choose their login method.',
  },

  // ─── CIAM Guide: Tokens ────────────────────────────────────────
  {
    id: 'guide.tokens.jwtBloat',
    title: 'JWT token bloat from excessive claims',
    description: 'Including too many claims in the JWT increases token size, adding latency on mobile.',
    severity: 'low',
    platforms: ['common'],
    flow: 'other',
    troubleshooting:
      'Review token configuration at Frontegg Portal → Security → Token Management. Only include claims your mobile app actually uses. Entitlement claims especially can be large. Consider using minimal token payloads with on-demand entitlement checks.',
  },
  {
    id: 'guide.tokens.customTemplateStripsClaims',
    title: 'Custom JWT template may strip required OIDC claims',
    description: 'Custom token templates can accidentally remove claims the SDK needs for validation.',
    severity: 'medium',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'When customizing JWT claims in the Frontegg portal, ensure required OIDC claims (iss, sub, aud, exp, iat) and Frontegg-required claims (tenantId, roles) are not removed. The mobile SDK validates these on every request.',
  },

  // ─── CIAM Guide: SMS / Passwordless ────────────────────────────
  {
    id: 'guide.sms.profileVsPrivacy',
    title: 'SMS login: phone set in Profile does not affect SMS sign-in',
    description: 'Phone number for SMS login must be set in Privacy & Security, not the Profile section.',
    severity: 'low',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'A phone number set in the self-service portal\'s Profile section does NOT affect SMS sign-in. The phone number for SMS login must be configured in Privacy & Security, or set during signup if the phone field is included in the form.',
  },
  {
    id: 'guide.magicLink.deepLinkRequired',
    title: 'Magic links require deep link scheme to open the app',
    description: 'Without a configured deep link scheme, magic links open in the browser instead of the app.',
    severity: 'high',
    platforms: ['common'],
    flow: 'deep-link',
    troubleshooting:
      'Magic links contain a URL like `{scheme}://{host}/magic-link?token=...`. If the app\'s deep link scheme is not configured (intent-filter on Android, CFBundleURLSchemes on iOS, Associated Domains), the link opens in the browser instead of the app.',
  },

  // ─── CIAM Guide: Password Policy ──────────────────────────────
  {
    id: 'guide.password.clientServerMismatch',
    title: 'Password complexity: client-side rules don\'t match server-side',
    description: 'Mismatched password rules between app form and Frontegg portal cause confusing errors.',
    severity: 'low',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Password complexity (min length, special chars, mixed case) is enforced server-side by Frontegg. If your mobile app has its own client-side validation with different rules, users see conflicting error messages. Align your client-side rules with the Frontegg portal settings at Security → Password.',
  },
  {
    id: 'guide.password.expiryEmbeddedMode',
    title: 'Password expiry prompt may not render in embedded/WebView mode',
    description: 'Expired password change prompts may not display correctly in embedded login.',
    severity: 'low',
    platforms: ['common'],
    flow: 'auth',
    troubleshooting:
      'Password expiry prompts are rendered by the Frontegg login box. In embedded/WebView mode, the change-password form may not display correctly due to WebView rendering differences. Test password expiry flows on real devices.',
  },
];

/**
 * Back-compat export for code that imports { RULES } (workspace-tools.ts etc.).
 */
export const RULES: RuleMeta[] = STATIC_RULES;

/** Merge static rules with dynamic rules extracted from a canonical SDK repo's README. */
export function getRules(knowledge?: SdkKnowledge | null): RuleMeta[] {
  if (!knowledge) return STATIC_RULES;
  const dynamic: RuleMeta[] = knowledge.knownIssues.map((ki) => ({
    id: `${knowledge.sdk}.knownIssue.${ki.id}`,
    title: ki.title,
    description: ki.body.slice(0, 200),
    severity: 'medium',
    platforms: [
      knowledge.sdk === 'android-kotlin'
        ? 'android'
        : knowledge.sdk === 'ios-swift'
          ? 'ios'
          : knowledge.sdk,
    ],
    sdk: [knowledge.sdk],
    flow: 'other',
    troubleshooting: ki.body,
    docAnchor: knowledge.docAnchors[ki.id],
  }));
  return [...STATIC_RULES, ...dynamic];
}
