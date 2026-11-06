/**
 * Host-provided org-aware URL builders, live in the browser realm (null in the
 * server realm). A plugin NEVER hand-assembles an org-prefixed URL — the org
 * the current page acts in is host state (the URL's `/:org` segment), and the
 * helpers keep every fetch/navigation pointing at the tenant the user is
 * actually browsing.
 */
export interface OrgPathHelpers {
  /**
   * An org-scoped data-plane path: `/plugin/jobs` becomes
   * `/api/v1/{org}/plugin/jobs`. Use for `fetch` calls to plugin-contributed
   * session endpoints (declared with `scope: "org"`).
   */
  api(path: string): string;
  /**
   * A page path: `/plugin/jobs` becomes `/{org}/plugin/jobs`. Use for links
   * and navigations inside the app shell.
   */
  page(path: string): string;
  /**
   * An org-scoped PLUGIN endpoint path: `/status` becomes
   * `/api/v1/{org}/plugin/status`. Use for `fetch` calls to the plugin's own
   * session endpoints (contributed with `scope: "org"`); `api()` is for
   * host-owned data routes (e.g. `/job-grant/initiate`).
   */
  plugin(path: string): string;
}
