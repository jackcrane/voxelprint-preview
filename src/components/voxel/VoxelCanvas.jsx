import React from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import * as THREE from "three";

import { FrameRateTracker } from "./FrameRateTracker.jsx";
import { VolumeStage } from "./VolumeStage.jsx";

export const VoxelCanvas = ({
  cameraPosition,
  diag,
  slices,
  volumeScale,
  isInteracting,
  previewSteps,
  fullSteps,
  yMax,
  onInteraction,
  onFpsUpdate,
  blendEnabled,
  alphaImpact,
  alphaImpactMin,
  alphaImpactMax,
  materialColorMap,
  onStatsChange,
  onMissingMaterials,
}) => (
  <Canvas
    camera={{
      position: cameraPosition,
      fov: 50,
      near: 0.01,
      far: Math.max(diag * 6, 10_000),
    }}
    style={{ width: "100%", height: "100vh", background: "#ffffff" }}
    onCreated={({ gl, scene, camera }) => {
      gl.setClearColor("#ffffff", 1);
      scene.background = new THREE.Color("#ffffff");
      camera.lookAt(0, 0, 0);
    }}
  >
    <OrbitControls
      makeDefault
      target={[0, 0, 0]}
      onStart={onInteraction}
      onChange={onInteraction}
      onEnd={onInteraction}
    />

    {/* <Environment preset="city" /> */}
    {/* <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
      <GizmoViewport
        axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]}
        labelColor="white"
      />
    </GizmoHelper> */}

    <ambientLight intensity={1} />
    <directionalLight position={[2, 4, 3]} intensity={1} />

    <FrameRateTracker onUpdate={onFpsUpdate} />
    <VolumeStage
      slices={slices}
      scale={volumeScale}
      isInteracting={isInteracting}
      previewSteps={previewSteps}
      fullSteps={fullSteps}
      yMax={yMax}
      blendEnabled={blendEnabled}
      alphaImpact={alphaImpact}
      alphaImpactMin={alphaImpactMin}
      alphaImpactMax={alphaImpactMax}
      materialColorMap={materialColorMap}
      onStatsChange={onStatsChange}
      onMissingMaterials={onMissingMaterials}
      diag={diag}
    />
  </Canvas>
);
