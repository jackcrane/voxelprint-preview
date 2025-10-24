import React, { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { CLEAR_ALPHA_SCALE } from "../../constants/materials";
import { volumeVertexShader, volumeFragmentShader } from "./volumeShaders.js";

export const VolumeMesh = ({
  resources,
  scale,
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

  useFrame(() => {
    if (!meshRef.current || !material) {
      return;
    }
    material.uniforms.u_modelMatrixInverse.value
      .copy(meshRef.current.matrixWorld)
      .invert();
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
      material.uniforms.u_steps.value = isInteracting
        ? previewSteps
        : fullSteps;
    }
  }, [material, isInteracting, previewSteps, fullSteps]);

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
