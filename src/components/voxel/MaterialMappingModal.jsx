import React from "react";

const parseColorKey = (key) =>
  key.split(" ").map((chunk) => {
    const value = Number.parseInt(chunk, 10);
    return Number.isFinite(value) ? value : 0;
  });

const MaterialRow = ({ sourceKey, selection, onSelect, materials }) => {
  const [r, g, b, a] = parseColorKey(sourceKey);
  const preview = `rgba(${r}, ${g}, ${b}, ${
    Math.round((a / 255) * 100) / 100
  })`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 12px",
        borderRadius: 6,
        background: "#f7f7f7",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1f1f1f" }}>
          Source: {sourceKey}
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: preview,
            border: "1px solid rgba(0, 0, 0, 0.2)",
          }}
        />
      </div>
      <label
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
          color: "#3f3f3f",
        }}
      >
        <span>Map to material</span>
        <select
          value={selection}
          onChange={(event) => onSelect(sourceKey, event.target.value)}
          style={{
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid #d0d0d0",
            fontSize: 12,
          }}
        >
          <option value="" disabled>
            Select a material…
          </option>
          {materials.map(({ key, name }) => (
            <option key={key} value={key}>
              {name} ({key})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export const MaterialMappingModal = ({
  missingColors,
  selections,
  onSelect,
  onConfirm,
  onCancel,
  materials,
  canConfirm,
}) => {
  if (!missingColors.length) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          padding: "20px 24px",
          borderRadius: 8,
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: "#1f1f1f" }}>
            Map Unknown Materials
          </span>
          <span style={{ fontSize: 13, color: "#4f4f4f" }}>
            Choose a known material that should replace each unmapped color.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {missingColors.map((key) => (
            <MaterialRow
              key={key}
              sourceKey={key}
              selection={selections[key] || ""}
              onSelect={onSelect}
              materials={materials}
            />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #c0c0c0",
              background: "#ffffff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: canConfirm ? "#2463eb" : "#9fb4f5",
              color: "#ffffff",
              fontSize: 12,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Apply mapping
          </button>
        </div>
      </div>
    </div>
  );
};
