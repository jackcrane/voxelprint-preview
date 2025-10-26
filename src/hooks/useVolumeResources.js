import { useCallback, useEffect, useRef, useState } from "react";

import { disposeVolumeResources } from "../volume/disposeResources.js";
import { useVolumeResourceLoader } from "./useVolumeResourceLoader.js";

const computeStats = (resource) => {
  const { voxelDimensions, paletteSize } = resource;
  const voxelCount =
    voxelDimensions.width * voxelDimensions.height * voxelDimensions.depth;
  const blendedBytes = resource.blendedVolumeTexture ? voxelCount * 4 : 0;
  const byteSize = voxelCount + paletteSize * 4 + blendedBytes;
  return {
    voxelDimensions,
    paletteSize,
    voxelCount,
    byteSize,
  };
};

const toMessage = (err) => (err instanceof Error ? err.message : String(err));

export const useVolumeResources = (
  slices,
  materialColorMap,
  blendRadius,
  renderScaleStepMultiplier = 1
) => {
  const [resources, setResources] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [missingColors, setMissingColors] = useState([]);
  const resourcesRef = useRef(null);

  const reset = useCallback(() => {
    setProgress(0);
    setError(null);
    setMissingColors([]);
    setResources(null);
    setStats(null);
    disposeVolumeResources(resourcesRef.current);
    resourcesRef.current = null;
  }, []);

  const start = useCallback(() => {
    setLoading(true);
  }, []);

  const success = useCallback((built) => {
    setResources(built);
    setProgress(100);
    setMissingColors(built.missingColors || []);
    setStats(computeStats(built));
  }, []);

  const failure = useCallback((err) => {
    setError(toMessage(err));
  }, []);

  const finish = useCallback(() => {
    setLoading(false);
  }, []);

  useVolumeResourceLoader(
    slices,
    materialColorMap,
    blendRadius,
    renderScaleStepMultiplier,
    {
      onReset: reset,
      onStart: start,
      onProgress: setProgress,
      onSuccess: success,
      onError: failure,
      onFinish: finish,
    },
    resourcesRef
  );

  useEffect(() => () => disposeVolumeResources(resourcesRef.current), []);

  return {
    resources,
    loading,
    progress,
    error,
    stats,
    missingColors,
  };
};
