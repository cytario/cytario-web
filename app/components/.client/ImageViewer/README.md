# Image Viewer Component

## Overview

The Image Viewer is a multi-panel microscopy image viewing interface that allows researchers to visualize and analyze multiplexed image data. It supports dynamic channel control, split-view comparisons, and real-time contrast adjustments for \*.ome.tif files.

## Architecture

```
ImageViewer
├── ImageControlBar (left sidebar)
│   ├── ImagePreview (navigation map)
│   └── ImageControlItems
│       └── Channels (visibility, contrast, histogram)
└── ImagePanels (main viewport area)
    ├── ImagePanel[0]
    └── ImagePanel[1] (optional)
```

## Layout

The ImageViewer component renders an ImagePreview and 1-n ImagePanels.

```
 ImageViewer
┌───────────────────────┬───────────────────────────────────────┐
│ImageControlBar        │ImagePanels                            │
│┌─────────────────────┐│┌──────────────────┬──────────────────┐│
││ImagePreview         │││ImagePanel(0)     │ImagePanel(1)     ││
││{viewStatePreview}   │││{viewStateActive} │{viewStateActive} ││
││{channelsStateActive}│││{channelsState(n)}│{channelsState(n)}││
││                     │││                  │                  ││
││                     │││                  │                  ││
│└─────────────────────┘││                  │                  ││
│┌─────────────────────┐││                  │                  ││
││ChannelsController   │││                  │                  ││
││{channelsStateActive}│││                  │                  ││
││                     │││                  │                  ││
││                     │││                  │                  ││
││                     │││                  │                  ││
│└─────────────────────┘│└──────────────────┴──────────────────┘│
└───────────────────────┴───────────────────────────────────────┘
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
│ ImageControlBar reflects:           │
│ channelsStates[0]                   │
└─────────────────────────────────────┘
```

## Core Concepts

### **Slide**

A single `*.ome.tif` file loaded into the viewer. Each slide maintains its own isolated state and can be viewed across multiple panels simultaneously.

### **Store Registry**

Each slide registers a unique Zustand store in a global registry, enabling:

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
- **Control Binding**: ImageControlBar always reflects the active VCS
- **Panel Assignment**: Each ImagePanel can be assigned any VCS

#### **Channel Properties**

```typescript
interface ChannelState {
  color: [number, number, number]; // RGB color mapping
  isVisible: boolean; // Visibility toggle
  contrastLimits: [number, number]; // Current contrast range
  contrastLimitsInitial: [number, number]; // Default contrast range
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
2. Metadata and loader initialization
3. Initial VCS[0] created with default channel settings
4. First ImagePanel created and assigned VCS[0]

### **Adding Split View**

1. User clicks "Add Panel"
2. New ImagePanel created
3. Current VCS duplicated to new slot
4. New panel assigned the duplicated VCS

### **Channel Control**

1. User adjusts channel in ImageControlBar
2. Active VCS updated
3. All panels displaying that VCS re-render
4. Other VCS remain unchanged

### **Panel Switching**

1. User clicks different ImagePanel
2. `imagePanelIndex` updates to new active panel
3. ImageControlBar loads the active panel's VCS
4. Controls reflect new VCS state

## Component Responsibilities

### **ImageViewer**

- Root component and state provider
- Layout management
- Store initialization

### **ImageControlBar**

- Channel visibility controls
- Contrast limit adjustments
- Histogram display
- Navigation preview
- Always reflects active panel's VCS

### **ImagePanels**

- Renders 1-n ImagePanel components
- Manages panel layout and sizing
- Handles panel creation/deletion

### **ImagePanel**

- Individual viewport rendering
- Mouse/keyboard interaction handling
- VPS synchronization
- VCS-specific channel rendering
