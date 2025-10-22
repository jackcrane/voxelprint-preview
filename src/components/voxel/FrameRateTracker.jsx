import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";

export const FrameRateTracker = ({ onUpdate }) => {
  const fpsRef = useRef({ frames: 0, time: 0 });

  useFrame((_, delta) => {
    const tracker = fpsRef.current;
    tracker.frames += 1;
    tracker.time += delta;
    if (tracker.time >= 0.5) {
      const fps = Math.round(tracker.frames / tracker.time);
      if (onUpdate) {
        onUpdate(fps);
      }
      tracker.frames = 0;
      tracker.time = 0;
    }
  });

  return null;
};
