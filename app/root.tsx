import { useEffect } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
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
import { Container } from "./components/Container";
import { useDirectoryStore } from "./components/DirectoryView/useDirectoryStore";
import { H1 } from "./components/Fonts";
import { GlobalSearch } from "./components/GlobalSearch";
import {
  NotificationInput,
  NotificationList,
} from "./components/Notification/Notification";
import { useNotificationStore } from "./components/Notification/Notification.store";
import { UserMenu } from "./components/UserMenu";
import { cytarioConfig } from "./config";
import { useFileStore } from "./utils/localFilesStore/useFileStore";

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
  const headerSlot = useDirectoryStore((s) => s.headerSlot);
  const data = useRouteLoaderData<RootLoaderResponse>("root");

  return (
    <header className="z-20 flex justify-between items-center h-12 bg-slate-950 top-0 left-0 right-0">
      <div className="h-full flex-shrink min-w-0">
        <Breadcrumbs />
      </div>

      <div className="hidden xl:block">{headerSlot}</div>

      <div className="h-full flex-none flex gap-2 p-2">
        <GlobalSearch />
        {data?.accountSettingsUrl && (
          <UserMenu accountSettingsUrl={data.accountSettingsUrl} />
        )}
      </div>
    </header>
  );
};

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<RootLoaderResponse>("root");

  useEffect(() => {
    if (data?.notification) {
      useNotificationStore.getState().addNotification(data?.notification);
    }
  }, [data?.notification]);

  // Hydrate file store from IndexedDB on mount
  useEffect(() => {
    useFileStore.getState().hydrate();
  }, []);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="flex flex-col h-screen text-slate-700 overflow-hidden font-montserrat">
        {data?.user && <AppHeader />}

        {children}

        <div id="modal" />
        <div id="tooltip" />
        <div id="notification" />

        <NotificationList />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  const error = useRouteError() as Error;

  return (
    <Container>
      <H1>{error.name}</H1>
      <p>{error?.message ?? "Unknown error"}</p>
    </Container>
  );
}
