import React, { useEffect } from "react";
import { Html } from "@react-three/drei";

import { BLEND_RADIUS_STEPS } from "../../constants/volume.js";
import { useVolumeResources } from "../../hooks/useVolumeResources.js";
import { BoundingBoxOutline } from "./BoundingBoxOutline.jsx";
import { CrossSectionFill } from "./CrossSectionFill.jsx";
import { CrossSectionOutline } from "./CrossSectionOutline.jsx";
import { VolumeMesh } from "./VolumeMesh.jsx";

export const VolumeStage = ({
  slices,
  scale,
  isInteracting,
  previewSteps,
  fullSteps,
  yMax,
  blendEnabled,
  materialColorMap,
  onStatsChange,
  onMissingMaterials,
}) => {
  const { resources, loading, progress, error, stats, missingColors } =
    useVolumeResources(slices, materialColorMap, BLEND_RADIUS_STEPS);

  useEffect(() => {
    if (onStatsChange) {
      onStatsChange(stats || null);
    }
  }, [stats, onStatsChange]);

  useEffect(() => {
    if (onMissingMaterials) {
      onMissingMaterials(missingColors || []);
    }
  }, [missingColors, onMissingMaterials]);

  const showCrossSection = yMax < 0.999;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <BoundingBoxOutline scale={scale} />
      {showCrossSection && <CrossSectionFill scale={scale} yMax={yMax} />}
      {showCrossSection && <CrossSectionOutline scale={scale} yMax={yMax} />}
      {resources && (
        <VolumeMesh
          resources={resources}
          scale={scale}
          isInteracting={isInteracting}
          previewSteps={previewSteps}
          fullSteps={fullSteps}
          yMax={yMax}
          blendEnabled={blendEnabled}
        />
      )}
      {!resources && loading && (
        <Html position={[0, 0, 0]} transform center>
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(0, 0, 0, 0.6)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            Building volume… {progress}%
          </div>
        </Html>
      )}
      {error && (
        <Html position={[0, 0, 0]} transform center>
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(128, 0, 0, 0.85)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
              maxWidth: 220,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        </Html>
      )}
    </group>
  );
};
