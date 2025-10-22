import React, { useMemo, useEffect } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
} from "@react-three/drei";

const inchToMeter = 0.0254;
const MATERIAL_COLOR_MAP = {
  "0 255 255 255": [0, 255, 255, 140], // VeroCY-V
  "255 0 255 255": [255, 0, 255, 200], // VeroMGT-V
  "255 255 0 255": [255, 255, 0, 100], // VeroYL-C
  "0 0 0 255": [0, 0, 0, 0], // VOID
  "137 137 137 255": [137, 137, 137, 1], // Clear
  "255 255 255 255": [255, 255, 255, 255], // White
};

const MAX_LOGGED_MISSING = 8;
const missingColorSamples = new Set();

const applyMaterialColorMap = (texture) => {
  const image = texture.image;
  if (!image) return texture;

  const width = image.width;
  const height = image.height;

  if (!width || !height) return texture;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return texture;

  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const localMissing = new Set();

  for (let i = 0; i < data.length; i += 4) {
    const key = `${data[i]} ${data[i + 1]} ${data[i + 2]} ${data[i + 3]}`;
    const mapped = MATERIAL_COLOR_MAP[key];
    if (mapped) {
      data[i] = mapped[0];
      data[i + 1] = mapped[1];
      data[i + 2] = mapped[2];
      data[i + 3] = mapped[3];
    } else if (
      missingColorSamples.size < MAX_LOGGED_MISSING &&
      localMissing.size < MAX_LOGGED_MISSING
    ) {
      localMissing.add(key);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  texture.image = canvas;
  if (texture.source) {
    texture.source.data = canvas;
  }
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 1;

  if (localMissing.size) {
    localMissing.forEach((key) => missingColorSamples.add(key));
    console.warn(
      "[Slices] Unmapped material colors (sampled):",
      Array.from(localMissing)
    );
  }

  return texture;
};

const SlicesGroup = ({ config }) => {
  const {
    SliceWidth,
    SliceHeight,
    XDpi,
    YDpi,
    SliceThicknessNanoMeter,
    slices,
  } = config;

  const widthM = SliceWidth * (inchToMeter / XDpi);
  const heightM = SliceHeight * (inchToMeter / YDpi);
  const yScale = 1;
  const dy = SliceThicknessNanoMeter * 1e-9 * yScale;

  const [textures, setTextures] = React.useState(null);
  const [progress, setProgress] = React.useState(0);

  // Stable object URLs
  const urls = useMemo(
    () => slices.map((b) => URL.createObjectURL(b)),
    [slices]
  );

  // Cleanup object URLs
  useEffect(() => {
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [urls]);

  // Load ONLY our slice textures; precise progress = loaded/urls.length
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    missingColorSamples.clear();

    console.log(`[Slices] Start loading ${urls.length} textures…`);
    setProgress(0);

    const jobs = urls.map((u, idx) => {
      return new Promise((resolve, reject) => {
        loader.load(
          u,
          (tex) => {
            applyMaterialColorMap(tex);
            loaded += 1;
            const pct = Math.round((loaded / urls.length) * 100);
            setProgress(pct);
            console.log(`[Slices] ${loaded}/${urls.length} (${pct}%)  ${idx}`);
            resolve(tex);
          },
          undefined,
          (err) => {
            console.error(`[Slices] Error loading ${idx}:`, err);
            reject(err);
          }
        );
      });
    });

    Promise.all(jobs)
      .then((texs) => {
        if (!cancelled) {
          setTextures(texs);
          console.log("[Slices] All textures loaded (100%).");
          if (missingColorSamples.size) {
            console.warn(
              "[Slices] Sample of unmapped colors:",
              Array.from(missingColorSamples)
            );
          }
        }
      })
      .catch(() => {
        // Already logged individual errors
      });

    return () => {
      cancelled = true;
    };
  }, [urls]);

  useEffect(() => {
    return () => {
      if (textures) {
        textures.forEach((tex) => tex.dispose());
      }
    };
  }, [textures]);

  if (!textures) return null;

  // Stack planes along +Y; scene is rotated so XZ is ground
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {textures.map((tex, i) => (
        // move along local Z; after the -90° X-rotation this is world +Y
        <mesh key={i} position={[0, 0, -i * dy]}>
          <planeGeometry args={[widthM, heightM]} />
          <meshBasicMaterial
            map={tex}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

export const VoxelPreview = ({ config }) => {
  const { SliceWidth, SliceHeight, XDpi, YDpi } = config;

  const widthM = SliceWidth * (inchToMeter / XDpi);
  const heightM = SliceHeight * (inchToMeter / YDpi);

  // Simple camera seed: back off by diagonal a bit
  const diag = Math.hypot(widthM, heightM);
  const camPos = [0, diag * 1.2, diag * 1.2];

  return (
    <Canvas
      camera={{ position: camPos, fov: 50, near: 0.01, far: 10_000 }}
      style={{ width: "100%", height: "80vh", background: "#ffffff" }}
      onCreated={({ gl, scene, camera }) => {
        gl.setClearColor("#ffffff", 1);
        scene.background = new THREE.Color("#ffffff");
        camera.lookAt(0, 0, 0);
      }}
    >
      <OrbitControls makeDefault target={[0, 0, 0]} />

      <Environment preset="city" />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]}
          labelColor="white"
        />
      </GizmoHelper>

      {/* Nice infinite ground reference in XZ */}
      <Grid
        cellSize={0.01}
        sectionSize={Math.max(widthM, heightM) * 2}
        cellColor="#6f6f6f"
        sectionColor="#9d4b4b"
        fadeDistance={1000}
        position={[0, 0, 0]}
        infiniteGrid
      />

      <ambientLight intensity={1} />
      <directionalLight position={[2, 4, 3]} intensity={1} />

      <SlicesGroup config={config} />
    </Canvas>
  );
};
