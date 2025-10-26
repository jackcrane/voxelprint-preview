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
  diag,
  isInteracting,
  previewSteps,
  fullSteps,
  yMax,
  blendEnabled,
  materialColorMap,
  onStatsChange,
  onMissingMaterials,
  alphaImpact,
  alphaImpactMin,
  alphaImpactMax,
  onLoadingStateChange,
  renderScaleStepMultiplier,
}) => {
  const { resources, loading, progress, error, stats, missingColors } =
    useVolumeResources(
      slices,
      materialColorMap,
      BLEND_RADIUS_STEPS,
      renderScaleStepMultiplier
    );

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

  useEffect(() => {
    if (onLoadingStateChange) {
      onLoadingStateChange({ loading, progress });
    }
  }, [loading, progress, onLoadingStateChange]);

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
          alphaImpact={alphaImpact}
          alphaImpactMin={alphaImpactMin}
          alphaImpactMax={alphaImpactMax}
          diag={diag}
        />
      )}
      {error && (
        <Html position={[0, 0, 0]} center>
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
