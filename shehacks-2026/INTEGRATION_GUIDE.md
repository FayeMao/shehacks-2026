# Integration Guide: MindAR + ObjectDetection

This guide explains how to use MindAR with ObjectDetection, sharing the same camera stream.

## Overview

The integration allows both MindAR (for AR navigation) and ObjectDetection (for object recognition) to use the same camera feed, avoiding conflicts and reducing resource usage.

## Components

### 1. ObjectDetection Component
- **Modified to accept external video element**: The component can now accept a `externalVideoElement` prop
- **Props**:
  - `externalVideoElement?: HTMLVideoElement | null` - Video element from MindAR
  - `autoStart?: boolean` - Auto-start detection (default: false)
  - `showUI?: boolean` - Show UI controls (default: true)

### 2. IntegratedNavigation Component
- **New component** that combines MindAR navigation with ObjectDetection
- Automatically detects and shares the video element from MindAR
- Located at: `app/components/IntegratedNavigation.tsx`

## Usage Options

### Option 1: Use IntegratedNavigation Component (Recommended)

Replace your navigation page with the integrated component:

```tsx
// app/navigation/page.tsx
import IntegratedNavigation from '../components/IntegratedNavigation';

export default function NavigationPage() {
  return <IntegratedNavigation />;
}
```

### Option 2: Manual Integration

If you want to integrate manually in your existing navigation page:

```tsx
import { useEffect, useState } from 'react';
import ObjectDetection from '../components/ObjectDetection';

export default function NavigationPage() {
  const [mindarVideoElement, setMindarVideoElement] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Wait for A-Frame scene to load
    const sceneEl = document.querySelector('a-scene');
    if (!sceneEl) return;

    const findVideo = () => {
      const scene = sceneEl as any;
      // Try different methods to find the video element
      if (scene.systems?.['mindar-image-system']?.video) {
        setMindarVideoElement(scene.systems['mindar-image-system'].video);
      } else if (scene.videoEl) {
        setMindarVideoElement(scene.videoEl);
      }
    };

    sceneEl.addEventListener('loaded', () => {
      setTimeout(findVideo, 1000);
    });
  }, []);

  return (
    <>
      {/* Your existing MindAR scene */}
      <a-scene mindar-image="imageTargetSrc: /targets.mind; autoStart: true;">
        {/* ... your AR entities ... */}
      </a-scene>

      {/* ObjectDetection overlay */}
      {mindarVideoElement && (
        <ObjectDetection externalVideoElement={mindarVideoElement} showUI={false} />
      )}
    </>
  );
}
```

## How It Works

1. **MindAR Initialization**: MindAR/A-Frame initializes and creates a video element for the camera
2. **Video Element Detection**: The integration code finds the video element created by MindAR
3. **Sharing**: The video element is passed to ObjectDetection component
4. **Parallel Processing**: 
   - MindAR uses the video for AR tracking and navigation
   - ObjectDetection uses the same video for object recognition
   - Both systems process the same camera feed simultaneously

## Troubleshooting

### Video Element Not Found

If the video element isn't being detected, you can:

1. **Check browser console**: Look for any errors or warnings
2. **Add debugging**: Add console.logs to see what's being found:
   ```tsx
   console.log('Scene systems:', scene.systems);
   console.log('Video element:', scene.videoEl);
   ```

3. **Try alternative approach**: Use a shared MediaStream instead (more complex but more reliable)

### Performance Issues

- Object detection runs continuously and may impact performance
- Consider throttling detection frequency if needed
- The detection runs on `requestAnimationFrame`, so it's optimized for 60fps

## Notes

- The video element access relies on MindAR's internal structure, which may vary by version
- If you're using a different version of MindAR, you may need to adjust the video element detection logic
- The TypeScript errors for A-Frame elements (`a-scene`, `a-camera`, etc.) are expected and can be ignored - these are custom elements registered at runtime
