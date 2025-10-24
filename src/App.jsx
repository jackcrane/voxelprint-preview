import React, { useState } from "react";
import { VoxelPreview } from "./components/VoxelPreview.jsx";
import { SLICE_MODE_LAYER_HEIGHT_NM } from "./constants/volume.js";
import { parseGCVF } from "./utils/parseGCVF.js";
import { extractZip } from "./utils/extractZip.js";

const DEFAULT_SLICE_SETTINGS = {
  XDpi: 600,
  YDpi: 600,
  SliceThicknessNanoMeter: SLICE_MODE_LAYER_HEIGHT_NM,
};

const readImageDimensions = async (file) => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      if (typeof bitmap.close === "function") {
        bitmap.close();
      }
      return dimensions;
    } catch (error) {
      console.warn("createImageBitmap failed, falling back to Image()", error);
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(url);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
};

export const App = () => {
  const [modelData, setModelData] = useState(null);

  const handleGcvfUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const files = await extractZip(file);
    const configFile = files["ConfigFile.xml"];
    if (!configFile) {
      alert("ConfigFile.xml not found");
      return;
    }

    const text = await configFile.text();
    console.log("Parsing GCVF...");
    const parsed = parseGCVF(text);

    const start = parsed.StartIndex;
    const end = start + parsed.NumberOfSlices - 1;
    const prefix = parsed.ImageFilePrefix || "layer_";

    const sliceBlobs = [];
    for (let i = start; i <= end; i++) {
      const nameA = `${prefix}${i}.png`;
      const nameB = Object.keys(files).find((key) => {
        if (!key.endsWith(".png")) return false;
        const num = key.replace(prefix, "").replace(".png", "");
        return parseInt(num, 10) === i;
      });
      const chosen = files[nameA] || (nameB ? files[nameB] : null);
      if (!chosen) {
        alert(`Missing slice image for index ${i}`);
        return;
      }
      sliceBlobs.push(chosen);
    }

    setModelData({ ...parsed, colorMode: "material", slices: sliceBlobs });
    console.log("Model Data set");
  };

  const handleSliceFolderUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const pngSlices = files
      .filter((file) => file.type === "image/png" || file.name.endsWith(".png"))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );

    if (!pngSlices.length) {
      alert("No PNG slices found in the selected folder.");
      return;
    }

    try {
      const { width, height } = await readImageDimensions(pngSlices[0]);
      const folderConfig = {
        ...DEFAULT_SLICE_SETTINGS,
        slices: pngSlices,
        colorMode: "direct",
        SliceWidth: width,
        SliceHeight: height,
      };
      setModelData(folderConfig);
      console.log("Direct color slice collection set");
    } catch (error) {
      console.error("Failed to read slice dimensions", error);
      alert("Unable to determine slice dimensions from the selected images.");
    }
  };

  return (
    <div style={{ padding: 16, background: "#ffffff", minHeight: "100vh" }}>
      <h1 style={{ marginTop: 0 }}>GCVF Viewer</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>GCVF archive (.gcvf)</span>
          <input type="file" accept=".gcvf" onChange={handleGcvfUpload} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Folder of slice PNGs</span>
          <input
            type="file"
            directory="true"
            webkitdirectory="true"
            multiple
            onChange={handleSliceFolderUpload}
          />
        </label>
      </div>
      {modelData && <VoxelPreview config={modelData} />}
    </div>
  );
};

export default App;
