import React, { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";

import { FrameRateTracker } from "./FrameRateTracker.jsx";
import { VolumeStage } from "./VolumeStage.jsx";

const BackgroundColorSync = ({ color }) => {
  const { gl, scene } = useThree();

  useEffect(() => {
    const nextColor = color || "#ffffff";
    gl.setClearColor(nextColor, 1);
    scene.background = new THREE.Color(nextColor);
  }, [color, gl, scene]);

  return null;
};

export const VoxelCanvas = ({
  cameraPosition,
  diag,
  backgroundColor,
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
  onLoadingStateChange,
  renderScaleStepMultiplier,
}) => {
  const canvasBackground = backgroundColor || "#ffffff";

  return (
    <Canvas
      camera={{
        position: cameraPosition,
        fov: 50,
        near: 0.01,
        far: Math.max(diag * 6, 10_000),
      }}
      style={{
        width: "100%",
        height: "100%",
        background: canvasBackground,
      }}
      onCreated={({ gl, scene, camera }) => {
        gl.setClearColor(canvasBackground, 1);
        scene.background = new THREE.Color(canvasBackground);
        camera.lookAt(0, 0, 0);
      }}
    >
      <BackgroundColorSync color={canvasBackground} />
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        onStart={onInteraction}
        onChange={onInteraction}
        onEnd={onInteraction}
        enableDamping={false}
      />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]}
          labelColor="white"
        />
      </GizmoHelper>

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
        onLoadingStateChange={onLoadingStateChange}
        renderScaleStepMultiplier={renderScaleStepMultiplier}
      />
    </Canvas>
  );
};
