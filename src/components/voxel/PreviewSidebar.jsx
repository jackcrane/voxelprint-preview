import React from "react";
import { formatBytes } from "../../utils/formatBytes.js";

const summarizeStats = (stats) => {
  if (!stats) return null;
  const {
    voxelDimensions: { width, height, depth },
    voxelCount,
    byteSize,
    paletteSize,
  } = stats;
  return {
    voxelDimensions: `${width} × ${height} × ${depth}`,
    voxelCount: voxelCount.toLocaleString(),
    paletteSize,
    memory: formatBytes(byteSize),
  };
};

export const PreviewSidebar = ({
  yMax,
  onYMaxChange,
  pendingMissingColors,
  mappingModalVisible,
  onOpenMappingModal,
  qualityPct,
  onQualityChange,
  qualityLabel,
  fullSteps,
  blendEnabled,
  onBlendToggle,
  blendRadius,
  stats,
  fps,
}) => {
  const statsSummary = summarizeStats(stats);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-start",
        alignItems: "stretch",
        padding: "0 8px",
        gap: 16,
        width: 220,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flex: "1 1 auto",
        }}
      >
        <span style={{ fontSize: 12, color: "#3f3f3f", marginBottom: 8 }}>
          Top
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={yMax}
          onChange={(event) => onYMaxChange(parseFloat(event.target.value))}
          style={{
            writingMode: "bt-lr",
            WebkitAppearance: "slider-vertical",
            width: "auto",
            height: "60vh",
          }}
          aria-label="Y-axis cross-section"
        />
        <span style={{ fontSize: 12, color: "#3f3f3f", marginTop: 8 }}>
          Bottom
        </span>
      </div>

      {pendingMissingColors.length > 0 && !mappingModalVisible && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "#fff4d6",
            borderRadius: 6,
            padding: "8px 10px",
            border: "1px solid #f2c97d",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#8a5400",
            }}
          >
            {pendingMissingColors.length} unmapped material
            {pendingMissingColors.length > 1 ? "s" : ""} detected
          </span>
          <button
            type="button"
            onClick={onOpenMappingModal}
            style={{
              alignSelf: "flex-start",
              padding: "4px 8px",
              borderRadius: 4,
              border: "none",
              background: "#f2a100",
              color: "#ffffff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Map materials
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <label
          htmlFor="quality-slider"
          style={{ fontSize: 13, color: "#1f1f1f", fontWeight: 600 }}
        >
          Quality
        </label>
        <input
          id="quality-slider"
          type="range"
          min="50"
          max="150"
          step="5"
          value={qualityPct}
          onChange={(event) => onQualityChange(parseFloat(event.target.value))}
        />
        <span style={{ fontSize: 12, color: "#3f3f3f" }}>
          {qualityLabel} · {qualityPct}% · {fullSteps} steps
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <label
          htmlFor="blend-toggle"
          style={{ fontSize: 13, color: "#1f1f1f", fontWeight: 600 }}
        >
          Blending Preview
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            id="blend-toggle"
            type="checkbox"
            checked={blendEnabled}
            onChange={(event) => onBlendToggle(event.target.checked)}
          />
          <span style={{ fontSize: 12, color: "#3f3f3f" }}>
            Blend neighbours (radius {blendRadius})
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          background: "#f5f5f5",
          borderRadius: 6,
          padding: "8px 10px",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1f1f1f" }}>
          Runtime Stats
        </span>
        <span style={{ fontSize: 12, color: "#3f3f3f" }}>
          FPS: {fps ? `${fps}` : "—"}
        </span>
        <span style={{ fontSize: 12, color: "#3f3f3f" }}>
          Memory: {statsSummary ? statsSummary.memory : "—"}
        </span>
        {statsSummary && (
          <>
            <span style={{ fontSize: 12, color: "#3f3f3f" }}>
              Voxels: {statsSummary.voxelDimensions}
            </span>
            <span style={{ fontSize: 12, color: "#3f3f3f" }}>
              Total voxels: {statsSummary.voxelCount}
            </span>
            <span style={{ fontSize: 12, color: "#3f3f3f" }}>
              Palette entries: {statsSummary.paletteSize}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
