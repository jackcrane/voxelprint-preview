import React, { useState } from "react";

import { BLEND_RADIUS_STEPS } from "../constants/volume.js";
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
  const { cameraPosition, diag, volumeScale, baseFullSteps } =
    computeVolumeMetrics(config);
  const { isInteracting, markInteracting } = useInteractionFlag();
  const mappings = useMaterialMappings();
  const quality = useQualitySettings(baseFullSteps);

  const [yMax, setYMax] = useState(1);
  const [stats, setStats] = useState(null);
  const [fps, setFps] = useState(null);
  const [blendEnabled, setBlendEnabled] = useState(true);

  return (
    <>
      {mappings.mappingModalVisible && mappings.pendingMissingColors.length > 0 && (
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
            materialColorMap={mappings.materialColorMap}
            onStatsChange={setStats}
            onMissingMaterials={mappings.handleMissingMaterials}
          />
        </div>
        <PreviewSidebar
          yMax={yMax}
          onYMaxChange={(value) => {
            if (Number.isFinite(value)) {
              setYMax(Math.max(0, Math.min(1, value)));
            }
          }}
          pendingMissingColors={mappings.pendingMissingColors}
          mappingModalVisible={mappings.mappingModalVisible}
          onOpenMappingModal={mappings.openMappingModal}
          qualityPct={quality.qualityPct}
          onQualityChange={quality.updateQuality}
          qualityLabel={quality.qualityLabel}
          fullSteps={quality.fullSteps}
          blendEnabled={blendEnabled}
          onBlendToggle={setBlendEnabled}
          blendRadius={BLEND_RADIUS_STEPS}
          stats={stats}
          fps={fps}
        />
      </div>
    </>
  );
};
