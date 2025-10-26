import React, { useEffect, useRef, useState } from "react";
import { VoxelPreview } from "./components/VoxelPreview.jsx";
import { SLICE_MODE_LAYER_HEIGHT_NM } from "./constants/volume.js";
import { parseGCVF } from "./utils/parseGCVF.js";
import { extractZip } from "./utils/extractZip.js";
import { Pane } from "tweakpane";
import "./styles/tweakpane.css";

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
  const paneContainerRef = useRef(null);
  const paneInstanceRef = useRef(null);
  const paneDataFolderRef = useRef(null);
  const dataStatusRef = useRef(null);
  const gcvfInputRef = useRef(null);
  const sliceFolderInputRef = useRef(null);

  useEffect(() => {
    if (!paneContainerRef.current || paneInstanceRef.current) return;
    paneInstanceRef.current = new Pane({
      title: "Voxel Preview",
      container: paneContainerRef.current,
      expanded: true,
    });
    return () => {
      paneInstanceRef.current?.dispose();
      paneInstanceRef.current = null;
      paneDataFolderRef.current = null;
      dataStatusRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!paneInstanceRef.current || paneDataFolderRef.current) return;
    const pane = paneInstanceRef.current;
    const folder = pane.addFolder({ title: "Data" });

    const handleGcvfClick = () => gcvfInputRef.current?.click();
    const handleSliceClick = () => sliceFolderInputRef.current?.click();

    const gcvfButton = folder.addButton({ title: "Load GCVF (.gcvf)" });
    gcvfButton.on("click", handleGcvfClick);

    const slicesButton = folder.addButton({ title: "Load PNG Folder" });
    slicesButton.on("click", handleSliceClick);

    const statusParams = {
      status: "No model loaded",
    };
    const statusBinding = folder.addBinding(statusParams, "status", {
      label: "Current",
      readonly: true,
    });

    paneDataFolderRef.current = folder;
    dataStatusRef.current = { params: statusParams, binding: statusBinding };

    return () => {
      statusBinding.dispose();
      folder.dispose();
      paneDataFolderRef.current = null;
      dataStatusRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!dataStatusRef.current) return;
    const { params, binding } = dataStatusRef.current;
    if (!modelData) {
      params.status = "No model loaded";
    } else {
      const sliceCount = modelData.slices?.length ?? 0;
      const modeLabel =
        modelData.colorMode === "material" ? "Material mode" : "Direct mode";
      params.status = `${sliceCount} slices · ${modeLabel}`;
    }
    binding.refresh();
  }, [modelData]);

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
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: "#0f0f0f",
      }}
    >
      <div
        ref={paneContainerRef}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 10,
        }}
      />

      <input
        id="gcvf-upload-input"
        name="gcvf-upload"
        ref={gcvfInputRef}
        type="file"
        accept=".gcvf"
        onChange={handleGcvfUpload}
        style={{ display: "none" }}
      />
      <input
        id="slice-folder-input"
        name="slice-folder"
        ref={sliceFolderInputRef}
        type="file"
        directory="true"
        webkitdirectory="true"
        multiple
        onChange={handleSliceFolderUpload}
        style={{ display: "none" }}
      />

      {modelData ? (
        <VoxelPreview config={modelData} controlPane={paneInstanceRef.current} />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#e0e0e0",
            fontSize: 18,
            letterSpacing: 0.5,
          }}
        >
          Use the pane to load a GCVF file or PNG slice folder.
        </div>
      )}
    </div>
  );
};

export default App;
