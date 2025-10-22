import React, { useMemo, useEffect } from "react";
import * as THREE from "three";

const buildHatchTexture = () => {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
};

export const CrossSectionFill = ({ scale, yMax }) => {
  const [scaleX, scaleY, scaleZ] = scale;
  const texture = useMemo(buildHatchTexture, []);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  useEffect(() => {
    const patternSize = 0.0025;
    const repeatX = Math.max(scaleX / patternSize, 1);
    const repeatY = Math.max(scaleY / patternSize, 1);
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;
  }, [texture, scaleX, scaleY]);

  const clamped = THREE.MathUtils.clamp(Number.isFinite(yMax) ? yMax : 1, 0, 1);
  const halfZ = scaleZ / 2;
  const z = clamped * scaleZ - halfZ;

  return (
    <mesh position={[0, 0, z]} renderOrder={52}>
      <planeGeometry args={[scaleX, scaleY]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthTest
        depthWrite={false}
        toneMapped={false}
        side={THREE.FrontSide}
      />
    </mesh>
  );
};
