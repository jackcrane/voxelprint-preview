import React, { useState } from "react";
import { VoxelPreview } from "./components/VoxelPreview.jsx";
import { parseGCVF } from "./utils/parseGCVF.js";
import { extractZip } from "./utils/extractZip.js";

export const App = () => {
  const [modelData, setModelData] = useState(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    console.log(file);
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

    // Collect slice PNGs that match prefix and range
    const start = parsed.StartIndex;
    const end = start + parsed.NumberOfSlices - 1;
    const prefix = parsed.ImageFilePrefix || "layer_";

    const sliceBlobs = [];
    for (let i = start; i <= end; i++) {
      // tolerate zero padding in archive: try both
      const nameA = `${prefix}${i}.png`;
      const nameB = Object.keys(files).find((k) => {
        if (!k.endsWith(".png")) return false;
        const num = k.replace(prefix, "").replace(".png", "");
        return parseInt(num, 10) === i;
      });
      const chosen = files[nameA] || (nameB ? files[nameB] : null);
      if (!chosen) {
        alert(`Missing slice image for index ${i}`);
        return;
      }
      sliceBlobs.push(chosen);
    }

    setModelData({ ...parsed, slices: sliceBlobs });
    console.log("Model Data set");
  };

  return (
    <div style={{ padding: 16, background: "#ffffff", minHeight: "100vh" }}>
      <h1 style={{ marginTop: 0 }}>GCVF Viewer</h1>
      <input type="file" accept=".gcvf,.zip" onChange={handleUpload} />
      {modelData && <VoxelPreview config={modelData} />}
    </div>
  );
};

export default App;
