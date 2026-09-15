import type { SignedFetch } from "./format";

/**
 * Props the host passes to a plugin viewer component (client-only render).
 * `httpsUrl` is resolved by the host from the connection store before the
 * plugin component renders — plugins never read the host store.
 */
export interface ViewerProps {
  resourceId: string;
  httpsUrl: string;
  signedFetch: SignedFetch;
}

export interface ViewerContribution {
  /** Synchronous path claim, checked in registration order before built-in dispatch. */
  match: (resourceId: string) => boolean;
  /**
   * React component; the host renders it under ClientOnly+Suspense (same
   * contract as the built-in viewers). Typed as unknown to keep plugin-api
   * React-free at the type level; the host casts to ComponentType<ViewerProps>.
   */
  component: unknown;
  /**
   * Optional async content sniff for ambiguous resources. Checked in
   * registration order after every sync match has failed; the first
   * canHandle that resolves true wins. A rejection counts as false.
   */
  canHandle?: (resourceId: string, httpsUrl: string, signedFetch: SignedFetch) => Promise<boolean>;
}

export interface ViewerRegistry {
  register(contribution: ViewerContribution): void;
}
