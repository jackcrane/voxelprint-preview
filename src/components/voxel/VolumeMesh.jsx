import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { CLEAR_ALPHA_SCALE } from "../../constants/materials";
import { volumeVertexShader, volumeFragmentShader } from "./volumeShaders.js";

export const VolumeMesh = ({
  resources,
  scale,
  diag,
  isInteracting,
  previewSteps,
  fullSteps,
  yMax,
  blendEnabled,
  alphaImpact,
  alphaImpactMin,
  alphaImpactMax,
}) => {
  const meshRef = useRef();

  const material = useMemo(() => {
    if (!resources) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        u_volume: { value: resources.volumeTexture },
        u_palette: { value: resources.paletteTexture },
        u_paletteSize: { value: resources.paletteSize },
        u_steps: { value: fullSteps },
        u_clearIndex: {
          value:
            typeof resources.clearPaletteIndex === "number"
              ? resources.clearPaletteIndex
              : -1,
        },
        u_clearAlphaScale: { value: CLEAR_ALPHA_SCALE },
        u_modelMatrixInverse: { value: new THREE.Matrix4() },
        u_yMax: { value: 1 },
        u_useBlend: { value: 0 },
        u_blendVolume: { value: resources.blendedVolumeTexture || null },
        u_alphaImpact: { value: 1 },
      },
      vertexShader: volumeVertexShader,
      fragmentShader: volumeFragmentShader,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      glslVersion: THREE.GLSL3,
    });
  }, [resources, fullSteps]);

  useFrame((state) => {
    if (!meshRef.current || !material) {
      return;
    }
    material.uniforms.u_modelMatrixInverse.value
      .copy(meshRef.current.matrixWorld)
      .invert();

    const cameraDistance = state.camera.position.length();
    const referenceDiag =
      Number.isFinite(diag) && diag > 0
        ? diag
        : Math.hypot(scale?.[0] || 1, scale?.[1] || 1, scale?.[2] || 1);
    const distanceFactor = THREE.MathUtils.clamp(
      cameraDistance / Math.max(0.001, referenceDiag * 1.1),
      0.25,
      1
    );
    const baseSteps = isInteracting ? previewSteps : fullSteps;
    const adaptiveSteps = Math.max(
      32,
      Math.round(baseSteps * distanceFactor)
    );
    if (material.uniforms.u_steps.value !== adaptiveSteps) {
      material.uniforms.u_steps.value = adaptiveSteps;
    }
  });

  useEffect(() => {
    return () => {
      if (material) {
        material.dispose();
      }
    };
  }, [material]);

  useEffect(() => {
    if (material) {
      material.uniforms.u_yMax.value = yMax;
    }
  }, [material, yMax]);

  useEffect(() => {
    if (!material) return;
    material.uniforms.u_useBlend.value =
      blendEnabled && resources?.blendedVolumeTexture ? 1 : 0;
    material.uniforms.u_blendVolume.value =
      resources?.blendedVolumeTexture || null;
  }, [material, blendEnabled, resources]);

  useEffect(() => {
    if (material && Number.isFinite(alphaImpact)) {
      const clamped = Math.max(
        alphaImpactMin ?? 0.01,
        Math.min(alphaImpactMax ?? alphaImpact, alphaImpact)
      );
      material.uniforms.u_alphaImpact.value = clamped;
    }
  }, [material, alphaImpact, alphaImpactMin, alphaImpactMax]);

  useEffect(() => {
    return () => {
      if (material && material.uniforms.u_blendVolume?.value) {
        material.uniforms.u_blendVolume.value = null;
      }
    };
  }, [material]);

  if (!resources || !material) {
    return null;
  }

  return (
    <mesh ref={meshRef} material={material} scale={scale}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
};
