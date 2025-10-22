import React, { useMemo, useEffect } from "react";
import * as THREE from "three";

const buildOutlineGeometry = (scale, yMax) => {
  const [scaleX, scaleY, scaleZ] = scale;
  const clamped = THREE.MathUtils.clamp(Number.isFinite(yMax) ? yMax : 1, 0, 1);
  const halfX = scaleX / 2;
  const halfY = scaleY / 2;
  const halfZ = scaleZ / 2;
  const z = clamped * scaleZ - halfZ;

  const points = new Float32Array([
    -halfX,
    -halfY,
    z,
    halfX,
    -halfY,
    z,

    halfX,
    -halfY,
    z,
    halfX,
    halfY,
    z,

    halfX,
    halfY,
    z,
    -halfX,
    halfY,
    z,

    -halfX,
    halfY,
    z,
    -halfX,
    -halfY,
    z,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3)
  );
  return geometry;
};

export const CrossSectionOutline = ({ scale, yMax }) => {
  const geometry = useMemo(
    () => buildOutlineGeometry(scale, yMax),
    [scale, yMax]
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={55}>
      <lineBasicMaterial
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        linewidth={1}
        color="#000000"
      />
    </lineSegments>
  );
};
