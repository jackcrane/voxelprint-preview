import { useEffect } from "react";

import { buildVolumeResources } from "../volume/buildVolumeResources.js";
import { disposeVolumeResources } from "../volume/disposeResources.js";

export const useVolumeResourceLoader = (
  slices,
  materialColorMap,
  blendRadius,
  { onReset, onStart, onProgress, onSuccess, onError, onFinish },
  resourcesRef
) => {
  useEffect(() => {
    let cancelled = false;
    onReset();

    if (!slices?.length) {
      onFinish(false);
      return () => {
        cancelled = true;
      };
    }

    onStart();

    const run = async () => {
      try {
        const built = await buildVolumeResources(
          slices,
          (pct) => {
            if (!cancelled) {
              onProgress(pct);
            }
          },
          materialColorMap,
          blendRadius
        );

        if (!built) {
          throw new Error("Volume data generation returned empty result.");
        }

        if (cancelled) {
          disposeVolumeResources(built);
          return;
        }

        resourcesRef.current = built;
        onSuccess(built);
      } catch (err) {
        if (!cancelled) {
          onError(err);
        }
      } finally {
        if (!cancelled) {
          onFinish(true);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    slices,
    materialColorMap,
    blendRadius,
    onReset,
    onStart,
    onProgress,
    onSuccess,
    onError,
    onFinish,
    resourcesRef,
  ]);
};
