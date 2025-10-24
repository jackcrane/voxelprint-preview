import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  BLEND_RADIUS_STEPS,
  GCVF_ALPHA_IMPACT_DEFAULT,
  GCVF_ALPHA_IMPACT_MAX,
  GCVF_ALPHA_IMPACT_MIN,
  LAYER_ALPHA_IMPACT_DEFAULT,
  LAYER_ALPHA_IMPACT_MAX,
  LAYER_ALPHA_IMPACT_MIN,
} from "../constants/volume.js";
import { MATERIAL_DEFINITIONS } from "../constants/materials.js";
import { computeVolumeMetrics } from "../utils/volumeMetrics.js";
import { useInteractionFlag } from "../hooks/useInteractionFlag.js";
import { useMaterialMappings } from "../hooks/useMaterialMappings.js";
import { useQualitySettings } from "../hooks/useQualitySettings.js";
import { MaterialMappingModal } from "./voxel/MaterialMappingModal.jsx";
import { PreviewSidebar } from "./voxel/PreviewSidebar.jsx";
import { VoxelCanvas } from "./voxel/VoxelCanvas.jsx";

export const VoxelPreview = ({ config }) => {
  const { slices } = config;
  const materialMappingEnabled = config?.colorMode !== "direct";
  const { cameraPosition, diag, volumeScale, baseFullSteps } =
    computeVolumeMetrics(config);
  const { isInteracting, markInteracting } = useInteractionFlag();
  const mappings = useMaterialMappings(materialMappingEnabled);
  const quality = useQualitySettings(baseFullSteps);
  const noop = useCallback(() => {}, []);
  const alphaImpactConfig = useMemo(
    () =>
      materialMappingEnabled
        ? {
            min: GCVF_ALPHA_IMPACT_MIN,
            max: GCVF_ALPHA_IMPACT_MAX,
            defaultValue: GCVF_ALPHA_IMPACT_DEFAULT,
          }
        : {
            min: LAYER_ALPHA_IMPACT_MIN,
            max: LAYER_ALPHA_IMPACT_MAX,
            defaultValue: LAYER_ALPHA_IMPACT_DEFAULT,
          },
    [materialMappingEnabled]
  );

  const [yMax, setYMax] = useState(1);
  const [stats, setStats] = useState(null);
  const [fps, setFps] = useState(null);
  const [blendEnabled, setBlendEnabled] = useState(() => materialMappingEnabled);
  const [alphaImpact, setAlphaImpact] = useState(
    alphaImpactConfig.defaultValue
  );

  const handleAlphaImpactChange = useCallback(
    (value) => {
      if (!Number.isFinite(value)) {
        return;
      }
      const clamped = Math.max(
        alphaImpactConfig.min,
        Math.min(alphaImpactConfig.max, value)
      );
      setAlphaImpact(clamped);
    },
    [alphaImpactConfig]
  );

  useEffect(() => {
    setAlphaImpact(alphaImpactConfig.defaultValue);
  }, [alphaImpactConfig, config?.slices]);

  useEffect(() => {
    setBlendEnabled(materialMappingEnabled);
  }, [materialMappingEnabled, config?.slices]);

  return (
    <>
      {materialMappingEnabled &&
        mappings.mappingModalVisible &&
        mappings.pendingMissingColors.length > 0 && (
          <MaterialMappingModal
            missingColors={mappings.pendingMissingColors}
            selections={mappings.materialSelectionDraft}
            onSelect={mappings.handleMaterialSelectionChange}
            onConfirm={mappings.applyMaterialMappings}
            onCancel={mappings.closeMappingModal}
            materials={MATERIAL_DEFINITIONS}
            canConfirm={mappings.canApplyMaterialMappings}
          />
        )}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 16,
        }}
      >
        <div style={{ flex: "1 1 auto" }}>
          <VoxelCanvas
            cameraPosition={cameraPosition}
            diag={diag}
            slices={slices}
            volumeScale={volumeScale}
            isInteracting={isInteracting}
            previewSteps={quality.previewSteps}
            fullSteps={quality.fullSteps}
            yMax={yMax}
            onInteraction={markInteracting}
            onFpsUpdate={setFps}
            blendEnabled={blendEnabled}
            alphaImpact={alphaImpact}
            alphaImpactMin={alphaImpactConfig.min}
            alphaImpactMax={alphaImpactConfig.max}
            materialColorMap={
              materialMappingEnabled ? mappings.materialColorMap : null
            }
            onStatsChange={setStats}
            onMissingMaterials={
              materialMappingEnabled
                ? mappings.handleMissingMaterials
                : undefined
            }
          />
        </div>
        <PreviewSidebar
          yMax={yMax}
          onYMaxChange={(value) => {
            if (Number.isFinite(value)) {
              setYMax(Math.max(0, Math.min(1, value)));
            }
          }}
          pendingMissingColors={
            materialMappingEnabled ? mappings.pendingMissingColors : []
          }
          mappingModalVisible={materialMappingEnabled && mappings.mappingModalVisible}
          onOpenMappingModal={
            materialMappingEnabled ? mappings.openMappingModal : noop
          }
          qualityPct={quality.qualityPct}
          onQualityChange={quality.updateQuality}
          qualityLabel={quality.qualityLabel}
          fullSteps={quality.fullSteps}
          blendEnabled={blendEnabled}
          onBlendToggle={setBlendEnabled}
          blendRadius={BLEND_RADIUS_STEPS}
          alphaImpact={alphaImpact}
          alphaImpactMin={alphaImpactConfig.min}
          alphaImpactMax={alphaImpactConfig.max}
          onAlphaImpactChange={handleAlphaImpactChange}
          stats={stats}
          fps={fps}
        />
      </div>
    </>
  );
};
