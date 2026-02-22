import { H1, RouterProvider, ToastProvider } from "@cytario/design";
import { useEffect, useRef } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useHref,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteError,
  useRouteLoaderData,
  type LinksFunction,
  type MiddlewareFunction,
  type LoaderFunctionArgs,
} from "react-router";

import { UserProfile } from "./.server/auth/getUserInfo";
import {
  sessionContext,
  sessionMiddleware,
} from "./.server/auth/sessionMiddleware";
import { sessionStorage } from "./.server/auth/sessionStorage";
import { Breadcrumbs } from "./components/Breadcrumbs/Breadcrumbs";
import { Section } from "./components/Container";
import { useLayoutStore } from "./components/DirectoryView/useLayoutStore";
import { GlobalSearch } from "./components/GlobalSearch";
import { type NotificationInput } from "./components/Notification/Notification.store";
import { UserMenu } from "./components/UserMenu";
import { cytarioConfig } from "./config";
import { toastBridge, toToastVariant } from "./toast-bridge";
import { useFileStore } from "./utils/localFilesStore/useFileStore";

import "@cytario/design/tokens/variables.css";
import "./tailwind.css";
import "rc-slider/assets/index.css";

export const links: LinksFunction = () => [
  {
    rel: "icon",
    type: "image/png",
    sizes: "96x96",
    href: "/favicon/favicon-96x96.png",
  },
  { rel: "icon", type: "image/svg+xml", href: "/favicon/favicon.svg" },
  { rel: "shortcut icon", href: "/favicon/favicon.ico" },
  {
    rel: "apple-touch-icon",
    sizes: "180x180",
    href: "/favicon/apple-touch-icon.png",
  },
  { rel: "manifest", href: "/favicon/site.webmanifest" },
];

export const handle = {
  breadcrumb: () => ({ label: "", to: "/", isRoot: true }),
};

export const middleware: MiddlewareFunction[] = [sessionMiddleware];
interface RootLoaderResponse {
  user?: UserProfile;
  notification?: NotificationInput;
  accountSettingsUrl?: string;
}

export const loader = async ({
  context,
}: LoaderFunctionArgs): Promise<RootLoaderResponse> => {
  const session = context.get(sessionContext);
  const user = session.get("user");
  const notification = session.get("notification");

  if (notification) {
    session.unset("notification");
    await sessionStorage.commitSession(session);
  }

  // Build Keycloak account settings URL server-side
  const accountSettingsUrl = user
    ? `${cytarioConfig.auth.baseUrl}/account?referrer=${cytarioConfig.auth.clientId}&referrer_uri=${cytarioConfig.endpoints.webapp}`
    : undefined;

  return { user, notification, accountSettingsUrl };
};

const AppHeader = () => {
  const headerSlot = useLayoutStore((s) => s.headerSlot);
  const data = useRouteLoaderData<RootLoaderResponse>("root");

  return (
    <header className="z-20 flex justify-between items-center h-12 bg-slate-950 top-0 left-0 right-0">
      <div className="h-full flex-shrink min-w-0">
        <Breadcrumbs />
      </div>

      <div className="hidden xl:block">{headerSlot}</div>

      <div className="h-full flex-none flex gap-2 p-2">
        <GlobalSearch />
        {data?.accountSettingsUrl && data.user && (
          <UserMenu
            user={data.user}
            accountSettingsUrl={data.accountSettingsUrl}
          />
        )}
      </div>
    </header>
  );
};

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<RootLoaderResponse>("root");
  const location = useLocation();
  const navigation = useNavigation();
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (data?.notification) {
      const variant = toToastVariant(data.notification.status ?? "info");
      toastBridge.emit({ variant, message: data.notification.message });
    }
  }, [data?.notification]);

  // Hydrate file store from IndexedDB on mount
  useEffect(() => {
    useFileStore.getState().hydrate();
  }, []);

  // Move focus to main content on route change (skip initial render)
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    const main = document.getElementById("main-content");
    if (main) {
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  const isNavigating = navigation.state === "loading";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col h-screen text-slate-700 overflow-hidden font-montserrat bg-white">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white focus:text-cytario-turquoise-700"
        >
          Skip to content
        </a>

        {isNavigating && (
          <div
            role="progressbar"
            aria-label="Loading page"
            className="fixed top-0 left-0 right-0 z-50 h-1 bg-cytario-turquoise-700/30"
          >
            <div className="h-full bg-cytario-turquoise-700 animate-progress-bar" />
          </div>
        )}

        {data?.user && <AppHeader />}

        <main
          id="main-content"
          className="relative flex-1 min-h-0 outline-none"
        >
          {children}
        </main>

        <div id="tooltip" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigate = useNavigate();

  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      <ToastProvider bridge={toastBridge}>
        <Outlet />
      </ToastProvider>
    </RouterProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Error";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data ?? "An error occurred while processing your request.";
  } else if (error instanceof Error) {
    // Log full error server-side but only show generic message to client
    // to avoid leaking internal details (session IDs, endpoints, stack traces)
    console.error("Unhandled error:", error);
  }

  return (
    <Section>
      <div role="alert">
        <H1>{title}</H1>
        <p>{message}</p>
        <a href="/" className="text-cytario-purple-500 underline mt-4 inline-block">
          Go home
        </a>
      </div>
    </Section>
  );
}
