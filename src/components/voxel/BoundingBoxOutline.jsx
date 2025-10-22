import React, { useMemo, useEffect } from "react";
import * as THREE from "three";

export const BoundingBoxOutline = ({ scale }) => {
  const geometry = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    return edges;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <lineSegments geometry={geometry} scale={scale} renderOrder={50}>
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
