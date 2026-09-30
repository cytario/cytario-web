import { useEffect, useState } from "react";
import { useSearchParams, type LoaderFunctionArgs } from "react-router";

import { detectBrightfieldGroup } from "~/components/.client/ImageViewer/state/store/types";
import { getSelectionStats } from "~/components/.client/ImageViewer/utils/getSelectionStats";
import { Container, Section } from "~/components/Container";
import { imageMetadata } from "~/lib/imageMetadata";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const { searchParams } = new URL(request.url);
  if (searchParams.has("probe")) {
    return Response.json({ ok: true });
  }
  return null;
};

interface DescribeChannel {
  key: string;
  name: string;
  fluor?: string;
  color?: [number, number, number, number];
  contrastLimits: [number, number] | null;
}

interface DescribePayload {
  connectionId: string;
  path: string;
  image: {
    dimensions: { x: number; y: number; z: number; c: number; t: number };
    pixelType: string;
    levelCount: number;
    channels: DescribeChannel[];
  };
}

const parseLoopbackPort = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value)) return null;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : null;
};

const MAX_LOOPBACK_PAYLOAD_BYTES = 48 * 1024;

/** Direct page loads race the protected layout's store seeding (its effect
 * runs after child effects), so the describe work must first wait for the
 * connection to land in the client store. `cancel` drops the deadline and
 * subscription when the effect unmounts. */
const STORE_SEED_TIMEOUT_MS = 10_000;

const waitForConnection = (connectionId: string, timeoutMs: number) => {
  let cleanup: () => void = () => {};
  const promise = new Promise<boolean>((resolve) => {
    const isConnected = (state = useConnectionsStore.getState()) =>
      state.connections[connectionId] !== undefined;
    if (isConnected()) return resolve(true);

    const unsubscribe = useConnectionsStore.subscribe((state) => {
      if (!isConnected(state)) return;
      cleanup();
      resolve(true);
    });
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    cleanup = () => {
      clearTimeout(timer);
      unsubscribe();
    };
  });
  return { promise, cancel: () => cleanup() };
};

export default function DescribeRoute() {
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get("connectionId") ?? "";
  const path = searchParams.get("path") ?? "";
  const port = parseLoopbackPort(searchParams.get("port"));

  const [status, setStatus] = useState("Starting…");
  const [done, setDone] = useState(false);

  const ready = Boolean(connectionId && path && port !== null);
  const loopback = `http://127.0.0.1:${port}`;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const wait = waitForConnection(connectionId, STORE_SEED_TIMEOUT_MS);
    (async () => {
      setStatus("Waiting for connection credentials…");
      const connectionReady = await wait.promise;
      if (cancelled) return;
      if (!connectionReady) {
        const message = `No connection ${connectionId} is visible to this session.`;
        window.location.assign(`${loopback}/result?error=${encodeURIComponent(message)}`);
        return;
      }
      const loaded = await imageMetadata.loadImage(connectionId, path);
      if (cancelled) return;
      if (!loaded) {
        const message = `Unable to load image ${connectionId}/${path}`;
        window.location.assign(`${loopback}/result?error=${encodeURIComponent(message)}`);
        return;
      }

      const { loader, metadata } = loaded;
      const pixels = metadata.Pixels;
      const channels = pixels.Channels;
      const keys = channels.map((channel, index) => channel.Name ?? `Channel ${index}`);
      const brightfield = detectBrightfieldGroup(keys);

      const describedChannels: DescribeChannel[] = [];
      for (let index = 0; index < channels.length; index++) {
        const channel = channels[index];
        const key = keys[index];
        if (!cancelled) {
          setStatus(`Computing stats ${index + 1}/${channels.length}: ${key}`);
        }
        let contrastLimits: [number, number] | null = null;
        try {
          const stats = await getSelectionStats({
            loader,
            selection: { c: index, x: 0, y: 0, z: 0, t: 0 },
          });
          // Brightfield R/G/B groups use the full domain as limits, mirroring the viewer.
          contrastLimits =
            brightfield &&
            (key === brightfield.red || key === brightfield.green || key === brightfield.blue)
              ? stats.domain
              : stats.contrastLimits;
        } catch {
          contrastLimits = null;
        }
        describedChannels.push({
          key,
          name: key,
          fluor: channel.Fluor,
          color: channel.Color,
          contrastLimits,
        });
      }
      if (cancelled) return;

      const payload: DescribePayload = {
        connectionId,
        path,
        image: {
          dimensions: {
            x: pixels.SizeX,
            y: pixels.SizeY,
            z: pixels.SizeZ ?? 0,
            c: pixels.SizeC ?? 0,
            t: pixels.SizeT ?? 0,
          },
          pixelType: pixels.Type,
          levelCount: loader.length,
          channels: describedChannels,
        },
      };
      const encodedPayload = encodeURIComponent(JSON.stringify(payload));
      if (encodedPayload.length > MAX_LOOPBACK_PAYLOAD_BYTES) {
        const message = `payload too large for loopback transport: ${describedChannels.length} channels`;
        window.location.assign(`${loopback}/result?error=${encodeURIComponent(message)}`);
        return;
      }
      window.location.assign(`${loopback}/result?payload=${encodedPayload}`);
      setDone(true);
    })();
    return () => {
      cancelled = true;
      wait.cancel();
    };
  }, [connectionId, path, port, ready, loopback]);

  if (port === null) {
    return (
      <Section>
        <Container>
          <pre>Invalid port. Expected an integer between 1 and 65535.</pre>
        </Container>
      </Section>
    );
  }
  if (!connectionId || !path) {
    return (
      <Section>
        <Container>
          <pre>Missing connectionId or path.</pre>
        </Container>
      </Section>
    );
  }
  if (done) {
    return (
      <Section>
        <Container>
          <pre>Result delivered to the CLI — you can close or reuse this tab.</pre>
        </Container>
      </Section>
    );
  }
  return (
    <Section>
      <Container>
        <pre>{status}</pre>
      </Container>
    </Section>
  );
}
