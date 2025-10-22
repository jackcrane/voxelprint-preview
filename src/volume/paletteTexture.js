import * as THREE from "three";

export const packPaletteTexture = (palette) => {
  const paletteArray = new Uint8Array(palette.length * 4);
  palette.forEach((rgba, index) => {
    const base = index * 4;
    paletteArray[base] = rgba[0];
    paletteArray[base + 1] = rgba[1];
    paletteArray[base + 2] = rgba[2];
    paletteArray[base + 3] = rgba[3];
  });
  const paletteTexture = new THREE.DataTexture(
    paletteArray,
    palette.length,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  paletteTexture.needsUpdate = true;
  paletteTexture.minFilter = THREE.NearestFilter;
  paletteTexture.magFilter = THREE.NearestFilter;
  paletteTexture.unpackAlignment = 1;
  paletteTexture.colorSpace = THREE.SRGBColorSpace;
  paletteTexture.flipY = false;
  return paletteTexture;
};
