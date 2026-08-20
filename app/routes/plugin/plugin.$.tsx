import { Fragment, type ComponentType, useEffect, useState } from "react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunction,
  useLocation,
} from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { toIdentity } from "~/.server/auth/getUserInfo";
import { routeRegistry } from "~/.server/routeRegistry";
import { Section } from "~/components/Container";
import { clientRouteRegistry } from "~/lib/clientRouteRegistry";

/**
 * Plugin-contributed route dispatch (SDS-CY-010093/010094).
 *
 * Plugins register `/plugin/*` routes via `ctx.routes` during bootstrap: the
 * server singleton records `loader`/`action`, the client singleton records
 * `element`. This splat route, colocated under the protected layout, is the
 * single merge point — React Router runs `authMiddleware` + the active-org
 * gate (the layout's middleware) before this route's loader/action, so
 * `identity` is resolved when plugin code runs (SDS-CY-010094). All `/plugin/*`
 * routes are session-auth by definition; carve-outs live under `/api/plugin/*`.
 *
 * No runtime dynamic-import (SDS-CY-010093): plugin modules are already
 * statically imported by `plugins.generated.ts`, so the registries are
 * populated at bootstrap. The server `routeRegistry` import is referenced only
 * from the `loader`/`action` server exports and is tree-shaken from the client
 * build; the client `clientRouteRegistry` import powers the default export.
 *
 * The contributed `element` is opaque at the plugin-api boundary; the host
 * owns the single cast from `unknown` to `ComponentType` at the render site
 * (SDS-CY-010083), with a callable-check guard so a non-callable registration
 * surfaces as a contained render-time error rather than a crash.
 */

const notFoundResponse = () => new Response(null, { status: 404 });

function resolvePath(params: Record<string, string | undefined>): string {
  const splat = params["*"];
  return splat ? `/plugin/${splat}` : "/plugin";
}

export async function loader(args: LoaderFunctionArgs): Promise<Response> {
  const path = resolvePath(args.params);
  const entry = routeRegistry.findByPath(path);
  if (!entry?.contribution.loader) return notFoundResponse();
  const { user } = args.context.get(authContext);
  const identity = toIdentity(user);
  return entry.contribution.loader({ request: args.request, params: args.params, identity });
}

export async function action(args: ActionFunctionArgs): Promise<Response> {
  const path = resolvePath(args.params);
  const entry = routeRegistry.findByPath(path);
  if (!entry?.contribution.action) return notFoundResponse();
  const { user } = args.context.get(authContext);
  const identity = toIdentity(user);
  return entry.contribution.action({ request: args.request, params: args.params, identity });
}

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}) => {
  if (formAction) return defaultShouldRevalidate;
  if (currentUrl.pathname !== nextUrl.pathname) return true;
  if (currentUrl.search !== nextUrl.search) return true;
  return false;
};

export default function PluginRoute() {
  const location = useLocation();
  // Plugin-contributed `element`s are registered only in the client-only
  // registry (SDS-CY-010091/010083), so the server cannot render them and
  // renders a stable shell instead. Render the same shell on the client's first
  // (hydration) render, then reveal the real element after mount — otherwise the
  // server fallback HTML mismatches the hydrated client tree (hydration error).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Section>
        <p>Loading…</p>
      </Section>
    );
  }

  const entry = clientRouteRegistry.findByPath(location.pathname);
  const element = entry?.contribution.element;

  if (typeof element !== "function") {
    // Missing or non-callable element (SDS-CY-010083). Contain the failure to
    // this route rather than crashing the render; the root ErrorBoundary
    // handles thrown errors, but a non-callable value is a configuration
    // defect best surfaced inline here.
    return (
      <Section>
        <p>Plugin route not configured.</p>
      </Section>
    );
  }

  const Element = element as ComponentType;
  return (
    <Fragment>
      <Element />
    </Fragment>
  );
}
