/**
 * Re-exports for backward compatibility. The canonical SDK repos are now
 * fetched live from GitHub — see `github.ts`. This module used to resolve
 * local filesystem paths and is kept only to avoid churn in callers that
 * imported `ALL_SDKS`.
 */
export { ALL_SDKS } from './github.js';
