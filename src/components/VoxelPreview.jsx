import React, { useMemo, useEffect, useState } from "react";
import * as THREE from "three";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
} from "@react-three/drei";
import { TextureLoader } from "three";

const inchToMeter = 0.0254;

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

    console.log(`[Slices] Start loading ${urls.length} textures…`);
    setProgress(0);

    const jobs = urls.map((u, idx) => {
      return new Promise((resolve, reject) => {
        loader.load(
          u,
          (tex) => {
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
        }
      })
      .catch(() => {
        // Already logged individual errors
      });

    return () => {
      cancelled = true;
    };
  }, [urls]);

  if (!textures) return null;

  // Stack planes along +Y; scene is rotated so XZ is ground
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {textures.map((tex, i) => (
        // move along local Z; after the -90° X-rotation this is world +Y
        <mesh key={i} position={[0, 0, -i * dy]}>
          <planeGeometry args={[widthM, heightM]} />
          <meshBasicMaterial map={tex} transparent side={THREE.DoubleSide} />
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

      {/* sanity probe — should ALWAYS be visible */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.02, 0.02, 0.02]} />
        <meshStandardMaterial color="hotpink" />
      </mesh>

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
