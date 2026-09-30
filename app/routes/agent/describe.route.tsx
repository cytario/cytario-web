import { useEffect, useState } from "react";
import { useSearchParams, type LoaderFunctionArgs } from "react-router";

import { detectBrightfieldGroup } from "~/components/.client/ImageViewer/state/store/types";
import { getSelectionStats } from "~/components/.client/ImageViewer/utils/getSelectionStats";
import { Container, Section } from "~/components/Container";
import { imageMetadata } from "~/lib/imageMetadata";

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

const VALID_PORT = (value: string | null): number | null => {
  if (value === null || value.trim() === "") return null;
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
};

export default function DescribeRoute() {
  const [searchParams] = useSearchParams();
  const connectionId = searchParams.get("connectionId") ?? "";
  const path = searchParams.get("path") ?? "";
  const port = VALID_PORT(searchParams.get("port"));

  const [status, setStatus] = useState("Starting…");
  const [done, setDone] = useState(false);

  const ready = Boolean(connectionId && path && port !== null);
  const loopback = `http://127.0.0.1:${port}`;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
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
      window.location.assign(
        `${loopback}/result?payload=${encodeURIComponent(JSON.stringify(payload))}`,
      );
      setDone(true);
    })();
    return () => {
      cancelled = true;
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
