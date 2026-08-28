# Image Viewer Component

## Overview

The Image Viewer is a multi-panel microscopy image viewing interface that allows researchers to visualize and analyze multiplexed image data. It supports dynamic channel control, split-view comparisons, and real-time contrast adjustments for \*.ome.tif files.

## Architecture

```
ImageViewer (composition root: registers decoders, provides store)
├── canvas/
│   ├── ImageCanvas (1-N ImagePanels + floating Toolbar)
│   │   ├── ImagePanel[0]
│   │   └── ImagePanel[1] (optional, up to 4)
│   ├── Toolbar (interaction modes: pan, inspect, draw; undo/redo)
│   ├── ImagePreview (navigation thumbnail)
│   ├── ResetViewStateButton (fit-to-frame reset)
│   ├── Annotations/ (deck.gl annotation layers)
│   ├── Channels/ (deck.gl channel layers)
│   ├── Measurements/ (scale bar, tick marks)
│   └── Overlays/ (overlay marker layers)
├── sidebar/
│   ├── OverviewControl (ImagePreview + Magnifier presets)
│   ├── ViewsControl (split-panel layout controls)
│   ├── ChannelsControl (visibility, contrast, histogram per channel)
│   ├── OverlaysControl (overlay toggles)
│   └── AnnotationsControl (annotation list, groups, thumbnails)
└── state/
    ├── store/ (Zustand store, selectors, undo/redo)
    ├── decoders/ (JPEG2000, LZW)
    ├── formats/ (built-in format loaders)
    ├── loaders/ (Bioformats Zarr)
    └── transport/ (SigV4 TIFF client, credentialed HTTP)
```

## Layout

The ImageViewer renders a canvas area with 1-N ImagePanels and a right-hand sidebar with feature controls.

```
 ImageViewer
┌───────────────────────────────────────┬───────────────────────┐
│ImageCanvas                            │Sidebar                │
│┌──────────────────┬──────────────────┐│┌─────────────────────┐│
││ImagePanel(0)     │ImagePanel(1)     │││OverviewControl      ││
││{viewStateActive} │{viewStateActive} │││ ImagePreview +       ││
││{channelsState(n)}│{channelsState(n)}│││ Magnifier presets    ││
││                  │                  ││├─────────────────────┤│
││                  │                  │││ViewsControl         ││
││                  │                  │││ (split-panel layout) ││
││                  │                  ││├─────────────────────┤│
││                  │                  │││ChannelsControl      ││
│└──────────────────┴──────────────────┘│││ (per-channel: color,││
│             [Floating Toolbar]        │││  contrast, histogram)│
│                                       │├─────────────────────┤│
│                                       ││OverlaysControl      ││
│                                       │├─────────────────────┤│
│                                       ││AnnotationsControl   ││
│                                       │└─────────────────────┘│
└───────────────────────────────────────┴───────────────────────┘
```

## Visual State Relationships

### **Panel-to-VCS Mapping**

```
 ImagePanels state
 ┌─────────────────────────────────────┐
 │ imagePanels: [0, 2]                 │◄── Panel indices
 │ imagePanelIndex: 0                  │◄── Active panel
 └─────────────────────────────────────┘
                 │
                 ▼
 ┌─────────────────────────────────────┐
 │ channelsStates[]                    │
 │ [0] Default ◄──── Panel[0] shows    │
 │ [1] Unused                          │
 │ [2] Custom  ◄──── Panel[1] shows    │
 │ [3] Unused                          │
 └─────────────────────────────────────┘
                 │
                 ▼
 ┌─────────────────────────────────────┐
 │ Sidebar controls reflect:           │
 │ channelsStates[0]                   │
 └─────────────────────────────────────┘
```

## Core Concepts

### **Slide**

A single `*.ome.tif` file loaded into the viewer. Each slide maintains its own isolated state and can be viewed across multiple panels simultaneously.

### **Store Registry**

Each slide registers a unique Zustand store in a global registry via `ViewerStoreProvider`. Registration accepts the image URL and an optional `offsetsUrl` for offset sidecar files. The registry enables:

- View state persistence across routes
- Independent state management per slide
- Memory cleanup when slides are unloaded
- Concurrent viewing of multiple slides

### **View State (VS)**

The complete viewing configuration for a slide, consisting of:

#### **Viewer Position State (VPS)**

- Pan position (`target`)
- Zoom level (`zoom`)
- Rotation (`rotationX`, `rotationOrbit`)
- Synchronized across panels viewing the same slide

#### **Viewer Channels State (VCS)**

- Channel visibility toggles
- Contrast limits per channel
- Color mappings
- Histogram data

### **Channels State Management**

#### **VCS (Viewer Channels State)**

Defines visualization settings for all channels in a slide:

- **Capacity**: Up to 4 different VCS configurations per slide
- **Active State**: Only one VCS is active at any time
- **Control Binding**: Sidebar always reflects the active VCS
- **Panel Assignment**: Each ImagePanel can be assigned any VCS

#### **Channel Properties**

```typescript
interface ChannelState {
  color: [number, number, number]; // RGB color mapping
  isVisible: boolean; // Visibility toggle
  contrastLimits: [number, number]; // Current contrast range
  domain: [number, number]; // Data value range
  histogram: number[]; // Histogram data
  pixelValue: number; // Current pixel value at cursor
  isLoading: boolean; // Loading state
  isInitialized: boolean; // Initialization state
}
```

### **Image Panels**

#### **Split View Support**

- **Panel Count**: 1-4 panels supported
- **Independent VCS**: Each panel can display different channel configurations
- **Synchronized VPS**: All panels viewing the same slide share position/zoom state
- **Comparison Mode**: Enables side-by-side analysis of different channel setups

#### **Panel-to-VCS Mapping**

```typescript
// Example: Panel 0 shows VCS[0], Panel 1 shows VCS[2]
imagePanels: [0, 2]; // Panel indices map to VCS indices
imagePanelIndex: 0; // Currently active panel (receives control input)
```

## State Flow

### **Loading a Slide**

1. Slide registers in store registry
2. Offset sidecar file fetched (if `offsetsUrl` provided), validated as `number[]`
3. `loadOmeTiff(url, { offsets })` called with offsets (or `undefined` for graceful fallback)
4. Metadata and loader initialization
5. Initial VCS[0] created with default channel settings
6. First ImagePanel created and assigned VCS[0]

### **Adding Split View**

1. User clicks "Add Panel"
2. New ImagePanel created
3. Current VCS duplicated to new slot
4. New panel assigned the duplicated VCS

### **Channel Control**

1. User adjusts channel in sidebar
2. Active VCS updated
3. All panels displaying that VCS re-render
4. Other VCS remain unchanged

### **Panel Switching**

1. User clicks different ImagePanel
2. `imagePanelIndex` updates to new active panel
3. Sidebar loads the active panel's VCS
4. Controls reflect new VCS state

## Decoder Registration

GeoTIFF decoders are registered at the module level in `ImageViewer.tsx`:

```typescript
import { addDecoder } from "geotiff";
addDecoder(5, () => LZWDecoder); // LZW compression
addDecoder(33005, () => JP2KDecoder); // JPEG2000 compression
```

This runs client-side only — decoders use Web Workers and must not be imported during SSR. The `ImageViewer` component is lazy-loaded from the route via `React.lazy()` + `<ClientOnly>` + `<Suspense>`, ensuring decoders are never evaluated on the server.

## OME-TIFF Offset Sidecar Files

The viewer supports **offset sidecar files** (`.offsets.json`) for faster OME-TIFF loading. TIFF files store image planes as sequentially-linked IFDs; offsets provide direct byte positions, eliminating sequential traversal over HTTP.

### Data Flow

```
Route Loader (server)
├── Detects OME-TIFF via getOffsetKeyForOmeTiff()
├── Provides signedFetch for direct SigV4-signed GetObject of image
├── Provides signedFetch for direct SigV4-signed GetObject of .offsets.json (in parallel)
└── Returns { url, offsetsUrl } to client

ImageViewer (client)
└── ViewerStoreProvider
    ├── Fetches offsetsUrl (if provided)
    ├── Validates response is number[] (rejects malformed JSON)
    ├── Falls back gracefully on 404/403/network error
    └── Passes offsets to loadOmeTiff(url, { offsets })
```

### Naming Convention

| Image key             | Offsets key               |
| --------------------- | ------------------------- |
| `data/image.ome.tif`  | `data/image.offsets.json` |
| `data/image.ome.tiff` | `data/image.offsets.json` |

Offsets are generated with [`generate-tiff-offsets`](https://github.com/hms-dbmi/generate-tiff-offsets) and placed alongside the OME-TIFF in S3. If the file doesn't exist, the viewer loads normally via sequential IFD traversal.

## Component Responsibilities

### **ImageViewer**

- Composition root: wires store provider, keyboard shortcuts, canvas + sidebar
- Decoder registration (LZW, JP2K)

### **ImageCanvas**

- Renders 1-N ImagePanel components
- Hosts the floating Toolbar
- Manages panel layout and sizing

### **ImagePanel**

- Individual viewport rendering
- Mouse/keyboard interaction handling
- VPS synchronization
- VCS-specific channel rendering

### **Sidebar Controls**

- **OverviewControl** — navigation thumbnail + magnification presets
- **ViewsControl** — split-panel layout (add/remove panels, assign VCS)
- **ChannelsControl** — per-channel visibility, color, contrast, histogram
- **OverlaysControl** — overlay layer toggles
- **AnnotationsControl** — annotation list, grouping, thumbnails
