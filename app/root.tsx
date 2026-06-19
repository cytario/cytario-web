import { H1, RouterProvider, ToastProvider } from "@cytario/design";
import { useEffect, useRef } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteError,
  useRouteLoaderData,
  type ClientLoaderFunctionArgs,
  type LinksFunction,
  type MiddlewareFunction,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunction,
} from "react-router";

import { UserProfile } from "./.server/auth/getUserInfo";
import { sessionContext, sessionMiddleware } from "./.server/auth/sessionMiddleware";
import { sessionStorage } from "./.server/auth/sessionStorage";
import { AppHeader } from "./components/AppHeader";
import { Container, Section } from "./components/Container";
import { type NotificationInput } from "./components/Notification/Notification.store";
import { cytarioConfig } from "./config";
import { type SerializedFavorite } from "./routes/favorites/favorites.loader";
import { FavoritesProvider } from "./routes/favorites/useFavorite";
import { toastBridge, toToastVariant } from "./toast-bridge";
import { useFileStore } from "./utils/localFilesStore/useFileStore";

import "@cytario/design/styles.css";
import "@cytario/design/tokens/variables.css";
import "@cytario/design/tokens/variables-dark.css";
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

export const middleware: MiddlewareFunction[] = [sessionMiddleware];

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formAction,
  defaultShouldRevalidate,
}) => {
  // Only revalidate after form submissions so flash notifications surface.
  if (formAction) return defaultShouldRevalidate;
  return false;
};

export interface RootLoaderResponse {
  user?: UserProfile;
  notification?: NotificationInput;
  accountSettingsUrl?: string;
}

export const loader = async ({ context }: LoaderFunctionArgs): Promise<RootLoaderResponse> => {
  const session = context.get(sessionContext);
  const user = session.get("user");
  const notification = session.get("notification");

  if (notification) {
    session.unset("notification");
    await sessionStorage.commitSession(session);
  }

  const accountSettingsUrl = user
    ? `${cytarioConfig.auth.baseUrl}/account?referrer=${cytarioConfig.auth.clientId}&referrer_uri=${cytarioConfig.endpoints.webapp}`
    : undefined;

  return { user, notification, accountSettingsUrl };
};

// Identity clientLoader. Forces this route off RR's bulk-fetch single-fetch
// path, which is short-circuited during initial hydrate when a descendant
// route opts into `clientLoader.hydrate = true` (RR issue #13873).
export const clientLoader = ({ serverLoader }: ClientLoaderFunctionArgs) =>
  serverLoader<typeof loader>();

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<RootLoaderResponse>("root");
  // Favorites load on the protected layout; read here so the header shares one
  // controller with the routed subtree. Undefined off that layout (e.g. login).
  const protectedData = useRouteLoaderData<{ favorites?: SerializedFavorite[] }>(
    "routes/layouts/protected.layout",
  );
  const location = useLocation();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (data?.notification) {
      const variant = toToastVariant(data.notification.status ?? "info");
      toastBridge.emit({ variant, message: data.notification.message });
    }
  }, [data?.notification]);

  useEffect(() => {
    useFileStore.getState().hydrate();
  }, []);

  // Move focus to main content on route change (skip initial render).
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
    <html lang="en" data-theme="light">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col h-screen text-muted-foreground overflow-hidden font-montserrat bg-white">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-white focus:text-secondary"
        >
          Skip to content
        </a>

        {isNavigating && (
          <div
            role="progressbar"
            aria-label="Loading page"
            className="fixed top-0 left-0 right-0 z-50 h-1 bg-secondary/30"
          >
            <div className="h-full bg-secondary animate-progress-bar" />
          </div>
        )}

        {/* No `useHref`: RR's collapses `//` in absolute URLs (C-201).
            Only needed for basename / hash routing — neither is in use. */}
        <RouterProvider navigate={navigate}>
          <FavoritesProvider favorites={protectedData?.favorites ?? []}>
            {data?.user && <AppHeader />}

            <main id="main-content" className="relative flex-1 min-h-0 outline-none">
              {children}
            </main>
          </FavoritesProvider>
        </RouterProvider>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ToastProvider bridge={toastBridge} placement="top-center">
      <Outlet />
    </ToastProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "Error";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    // `error.data` may be a string or a JSON object (e.g. a gate deny's
    // `{ error }`). Extract a string — rendering an object would throw.
    const data: unknown = error.data;
    if (typeof data === "string") {
      message = data;
    } else if (
      data &&
      typeof data === "object" &&
      typeof (data as { error?: unknown }).error === "string"
    ) {
      message = (data as { error: string }).error;
    } else {
      message = "An error occurred while processing your request.";
    }
  } else if (error instanceof Error) {
    // Log full error but show only the generic message to avoid leaking
    // session IDs, endpoints, or stack traces to the client.
    console.error("Unhandled error:", error);
  }

  return (
    <Section>
      <Container>
        <div role="alert">
          <H1>{title}</H1>
          <p>{message}</p>
          <a href="/" className="text-primary underline mt-4 inline-block">
            Go home
          </a>
        </div>
      </Container>
    </Section>
  );
}
