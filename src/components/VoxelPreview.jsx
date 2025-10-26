import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
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
import { VoxelCanvas } from "./voxel/VoxelCanvas.jsx";

const formatMemory = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const toFiniteNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

export const VoxelPreview = ({ config, controlPane }) => {
  const { slices } = config;
  const materialMappingEnabled = config?.colorMode !== "direct";
  const { cameraPosition, diag, volumeScale, baseFullSteps } =
    computeVolumeMetrics(config);
  const { isInteracting, markInteracting } = useInteractionFlag();
  const mappings = useMaterialMappings(materialMappingEnabled);
  const quality = useQualitySettings(baseFullSteps);
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
  const [volumeLoading, setVolumeLoading] = useState({
    loading: false,
    progress: 0,
  });

  const pendingMissingColors = materialMappingEnabled
    ? mappings.pendingMissingColors
    : [];
  const mappingModalVisible =
    materialMappingEnabled && mappings.mappingModalVisible;
  const openMappingModal = materialMappingEnabled
    ? mappings.openMappingModal
    : null;

  const updateQuality = quality.updateQuality;

  const latestValuesRef = useRef({
    yMax: 1,
    qualityPct: 100,
    alphaImpact: alphaImpactConfig.defaultValue,
  });

  const paneControlsRef = useRef({
    folder: null,
    statsFolder: null,
    params: {
      slice: 1,
      quality: 100,
      blend: true,
      alphaImpact: alphaImpactConfig.defaultValue,
    },
    controlBindings: {},
    stats: {
      fps: "—",
      memory: "—",
      voxels: "—",
      total: "—",
      palette: "—",
      status: "Idle",
    },
    statBindings: {},
    mappingButton: null,
  });

  const controlUpdatePendingRef = useRef({
    slice: false,
    quality: false,
    alpha: false,
  });

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

  const handleLoadingStateChange = useCallback((state) => {
    setVolumeLoading(state);
  }, []);

  useEffect(() => {
    setAlphaImpact(alphaImpactConfig.defaultValue);
  }, [alphaImpactConfig, config?.slices]);

  useEffect(() => {
    setBlendEnabled(materialMappingEnabled);
  }, [materialMappingEnabled, config?.slices]);

  useEffect(() => {
    latestValuesRef.current.yMax = yMax;
    if (controlUpdatePendingRef.current.slice) {
      controlUpdatePendingRef.current.slice = false;
      return;
    }
    const binding = paneControlsRef.current.controlBindings.slice;
    if (binding) {
      paneControlsRef.current.params.slice = yMax;
      binding.refresh();
    }
  }, [yMax]);

  useEffect(() => {
    latestValuesRef.current.qualityPct = quality.qualityPct;
    if (controlUpdatePendingRef.current.quality) {
      controlUpdatePendingRef.current.quality = false;
      return;
    }
    const binding = paneControlsRef.current.controlBindings.quality;
    if (binding) {
      paneControlsRef.current.params.quality = quality.qualityPct;
      binding.refresh();
    }
  }, [quality.qualityPct]);

  useEffect(() => {
    latestValuesRef.current.alphaImpact = alphaImpact;
    if (controlUpdatePendingRef.current.alpha) {
      controlUpdatePendingRef.current.alpha = false;
      return;
    }
    const binding = paneControlsRef.current.controlBindings.alphaImpact;
    if (binding) {
      paneControlsRef.current.params.alphaImpact = alphaImpact;
      binding.refresh();
    }
  }, [alphaImpact]);

  useEffect(() => {
    if (!controlPane) return undefined;
    const ref = paneControlsRef.current;

    const disposeFolders = () => {
      Object.values(ref.controlBindings).forEach((binding) =>
        binding?.dispose()
      );
      Object.values(ref.statBindings).forEach((binding) => binding?.dispose());
      ref.mappingButton?.dispose();
      ref.folder?.dispose();
      ref.statsFolder?.dispose();
      ref.folder = null;
      ref.statsFolder = null;
      ref.controlBindings = {};
      ref.statBindings = {};
      ref.mappingButton = null;
    };

    disposeFolders();

    const folder = controlPane.addFolder({ title: "Preview Settings" });
    ref.folder = folder;

    const sliceBinding = folder.addBinding(ref.params, "slice", {
      label: "Slice Height",
      min: 0,
      max: 1,
      step: 0.01,
    });
    sliceBinding.on("change", (event) => {
      const parsed = toFiniteNumber(event.value);
      if (!Number.isFinite(parsed)) {
        ref.params.slice = latestValuesRef.current.yMax;
        sliceBinding.refresh();
        return;
      }
      controlUpdatePendingRef.current.slice = true;
      setYMax(Math.max(0, Math.min(1, parsed)));
    });

    const qualityBinding = folder.addBinding(ref.params, "quality", {
      label: "Quality (%)",
      min: 50,
      max: 150,
      step: 5,
    });
    qualityBinding.on("change", (event) => {
      const parsed = toFiniteNumber(event.value);
      if (!Number.isFinite(parsed)) {
        ref.params.quality = latestValuesRef.current.qualityPct;
        qualityBinding.refresh();
        return;
      }
      controlUpdatePendingRef.current.quality = true;
      updateQuality(parsed);
    });

    const blendBinding = folder.addBinding(ref.params, "blend", {
      label: "Blend Neighbours",
    });
    blendBinding.on("change", (event) => {
      setBlendEnabled(Boolean(event.value));
    });

    const alphaBinding = folder.addBinding(ref.params, "alphaImpact", {
      label: "Transparency Curve",
      min: alphaImpactConfig.min,
      max: alphaImpactConfig.max,
      step: 0.01,
    });
    alphaBinding.on("change", (event) => {
      const parsed = toFiniteNumber(event.value);
      if (!Number.isFinite(parsed)) {
        ref.params.alphaImpact = latestValuesRef.current.alphaImpact;
        alphaBinding.refresh();
        return;
      }
      controlUpdatePendingRef.current.alpha = true;
      handleAlphaImpactChange(parsed);
    });

    let mappingButton = null;
    if (materialMappingEnabled && openMappingModal) {
      mappingButton = folder.addButton({ title: "Map Materials" });
      mappingButton.on("click", () => {
        openMappingModal();
      });
    }

    ref.controlBindings = {
      slice: sliceBinding,
      quality: qualityBinding,
      blend: blendBinding,
      alphaImpact: alphaBinding,
    };
    ref.mappingButton = mappingButton;

    const statsFolder = controlPane.addFolder({ title: "Runtime Stats" });
    ref.statsFolder = statsFolder;

    const fpsBinding = statsFolder.addBinding(ref.stats, "fps", {
      label: "FPS",
      readonly: true,
    });
    const memoryBinding = statsFolder.addBinding(ref.stats, "memory", {
      label: "Memory",
      readonly: true,
    });
    const voxelsBinding = statsFolder.addBinding(ref.stats, "voxels", {
      label: "Voxel Bounds",
      readonly: true,
    });
    const totalBinding = statsFolder.addBinding(ref.stats, "total", {
      label: "Total Voxels",
      readonly: true,
    });
    const paletteBinding = statsFolder.addBinding(ref.stats, "palette", {
      label: "Palette Size",
      readonly: true,
    });
    const statusBinding = statsFolder.addBinding(ref.stats, "status", {
      label: "Volume",
      readonly: true,
    });

    ref.statBindings = {
      fps: fpsBinding,
      memory: memoryBinding,
      voxels: voxelsBinding,
      total: totalBinding,
      palette: paletteBinding,
      status: statusBinding,
    };

    return () => {
      disposeFolders();
    };
  }, [
    controlPane,
    materialMappingEnabled,
    alphaImpactConfig.max,
    alphaImpactConfig.min,
    openMappingModal,
    updateQuality,
    handleAlphaImpactChange,
  ]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.controlBindings.slice) return;
    ref.params.slice = yMax;
    ref.controlBindings.slice.refresh();
  }, [yMax]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.controlBindings.quality) return;
    ref.params.quality = quality.qualityPct;
    ref.controlBindings.quality.refresh();
  }, [quality.qualityPct]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.controlBindings.blend) return;
    ref.params.blend = blendEnabled;
    ref.controlBindings.blend.refresh();
  }, [blendEnabled]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.controlBindings.alphaImpact) return;
    ref.params.alphaImpact = alphaImpact;
    ref.controlBindings.alphaImpact.refresh();
  }, [alphaImpact]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.mappingButton) return;
    if (!materialMappingEnabled) {
      ref.mappingButton.disabled = true;
      ref.mappingButton.title = "Material mapping disabled";
      return;
    }
    const missing = pendingMissingColors.length;
    ref.mappingButton.title =
      missing > 0
        ? `Map ${missing} material${missing > 1 ? "s" : ""}`
        : "All materials mapped";
    ref.mappingButton.disabled = missing === 0;
  }, [pendingMissingColors, materialMappingEnabled]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.statBindings.fps) return;
    ref.stats.fps = fps ? fps.toFixed(1) : "—";
    ref.statBindings.fps.refresh();
  }, [fps]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.statBindings.memory) return;
    if (!stats) {
      ref.stats.memory = "—";
      ref.stats.voxels = "—";
      ref.stats.total = "—";
      ref.stats.palette = "—";
    } else {
      const {
        voxelDimensions: { width, height, depth },
        voxelCount,
        byteSize,
        paletteSize,
      } = stats;
      ref.stats.memory = formatMemory(byteSize);
      ref.stats.voxels = `${width} × ${height} × ${depth}`;
      ref.stats.total = voxelCount.toLocaleString();
      ref.stats.palette = paletteSize;
    }
    ref.statBindings.memory.refresh();
    ref.statBindings.voxels?.refresh();
    ref.statBindings.total?.refresh();
    ref.statBindings.palette?.refresh();
  }, [stats]);

  useEffect(() => {
    const ref = paneControlsRef.current;
    if (!ref.statBindings.status) return;
    let label = "Idle";
    if (volumeLoading.loading) {
      const pct = Number.isFinite(volumeLoading.progress)
        ? Math.round(volumeLoading.progress)
        : 0;
      label = `Building volume… ${pct}%`;
    } else if (stats) {
      label = "Ready";
    }
    ref.stats.status = label;
    ref.statBindings.status.refresh();
  }, [volumeLoading, stats]);

  return (
    <>
      {materialMappingEnabled &&
        mappingModalVisible &&
        pendingMissingColors.length > 0 && (
          <MaterialMappingModal
            missingColors={pendingMissingColors}
            selections={mappings.materialSelectionDraft}
            onSelect={mappings.handleMaterialSelectionChange}
            onConfirm={mappings.applyMaterialMappings}
            onCancel={mappings.closeMappingModal}
            materials={MATERIAL_DEFINITIONS}
            canConfirm={mappings.canApplyMaterialMappings}
          />
        )}

      <div style={{ width: "100%", height: "100%" }}>
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
            materialMappingEnabled ? mappings.handleMissingMaterials : undefined
          }
          onLoadingStateChange={handleLoadingStateChange}
        />
      </div>
    </>
  );
};
