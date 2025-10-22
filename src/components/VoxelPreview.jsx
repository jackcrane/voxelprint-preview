import React, {
  useMemo,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Html,
} from "@react-three/drei";

const inchToMeter = 0.0254;
const MATERIAL_DEFINITIONS = [
  { key: "0 255 255 255", rgba: [0, 255, 255, 140], name: "VeroCY-V" },
  { key: "255 0 255 255", rgba: [255, 0, 255, 200], name: "VeroMGT-V" },
  { key: "255 255 0 255", rgba: [255, 255, 0, 100], name: "VeroYL-C" },
  { key: "0 0 0 255", rgba: [0, 0, 0, 0], name: "VOID" },
  { key: "137 137 137 255", rgba: [137, 137, 137, 1], name: "UltraClear" },
  {
    key: "255 255 255 255",
    rgba: [255, 255, 255, 255],
    name: "VeroUltraWhite",
  },
];
const MATERIAL_COLOR_MAP = MATERIAL_DEFINITIONS.reduce((acc, { key, rgba }) => {
  acc[key] = rgba;
  return acc;
}, {});
const MATERIAL_LOOKUP = MATERIAL_DEFINITIONS.reduce((acc, entry) => {
  acc[entry.key] = entry;
  return acc;
}, {});

const CLEAR_MATERIAL_KEY = "137 137 137 255";
const CLEAR_PALETTE_ENTRY_KEY =
  MATERIAL_COLOR_MAP[CLEAR_MATERIAL_KEY]?.join(",");
const CLEAR_ALPHA_SCALE = 0.08; // Additional attenuation so clear voxels accumulate less opacity

const MAX_LOGGED_MISSING = 8;
const MAX_PALETTE_SIZE = 256;
const missingColorSamples = new Set();
const TARGET_AXIS_RESOLUTION = 256;
const BLEND_RADIUS_STEPS = 1;
const BLEND_CENTER_WEIGHT = 16;
const BLEND_FALLOFF = 10;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "—";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const FrameRateTracker = ({ onUpdate }) => {
  const fpsRef = useRef({ frames: 0, time: 0 });

  useFrame((_, delta) => {
    const target = fpsRef.current;
    target.frames += 1;
    target.time += delta;
    if (target.time >= 0.5) {
      const currentFps = Math.round(target.frames / target.time);
      if (onUpdate) {
        onUpdate(currentFps);
      }
      target.frames = 0;
      target.time = 0;
    }
  });

  return null;
};

const computeDownsampleStep = (size) =>
  Math.max(1, Math.ceil(size / TARGET_AXIS_RESOLUTION));

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const decodeSlice = async (blob) => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx) => ctx.drawImage(bitmap, 0, 0),
      close: () => {
        bitmap.close();
      },
    };
  }

  const url = URL.createObjectURL(blob);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

  return {
    width: image.width,
    height: image.height,
    draw: (ctx) => ctx.drawImage(image, 0, 0),
    close: () => {
      URL.revokeObjectURL(url);
    },
  };
};

const mapMaterialColor = (r, g, b, a, localMissing, materialColorMap) => {
  const key = `${r} ${g} ${b} ${a}`;
  const mapped = materialColorMap[key];
  if (mapped) return mapped;

  if (
    missingColorSamples.size < MAX_LOGGED_MISSING &&
    localMissing.size < MAX_LOGGED_MISSING
  ) {
    localMissing.add(key);
  }

  return [r, g, b, a];
};

const ensurePaletteEntry = (lookup, palette, color) => {
  const key = color.join(",");
  if (lookup.has(key)) {
    return lookup.get(key);
  }

  if (palette.length >= MAX_PALETTE_SIZE) {
    throw new Error(
      `Palette overflow: encountered more than ${MAX_PALETTE_SIZE} unique colors`
    );
  }

  const entry = [
    clampByte(color[0]),
    clampByte(color[1]),
    clampByte(color[2]),
    clampByte(color[3]),
  ];

  const index = palette.length;
  palette.push(entry);
  lookup.set(key, index);
  return index;
};

const createBlendedVolumeTexture = (
  data,
  dimensions,
  palette,
  clearPaletteIndex,
  radius
) => {
  if (!radius || radius < 1) {
    return null;
  }

  const { width, height, depth } = dimensions;
  const voxelCount = width * height * depth;
  if (!voxelCount) {
    return null;
  }

  const adjustedPalette = palette.map((rgba, index) => {
    const alphaScale = index === clearPaletteIndex ? CLEAR_ALPHA_SCALE : 1;
    return [
      rgba[0] / 255,
      rgba[1] / 255,
      rgba[2] / 255,
      (rgba[3] / 255) * alphaScale,
    ];
  });

  const blended = new Uint8Array(voxelCount * 4);

  const indexFor = (x, y, z) => z * width * height + y * width + x;

  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let accumR = 0;
        let accumG = 0;
        let accumB = 0;
        let accumAlpha = 0;
        let totalColorWeight = 0;
        let totalAlphaWeight = 0;

        const addSample = (sx, sy, sz, weight) => {
          if (!weight || weight <= 0) {
            return;
          }
          if (
            sx < 0 ||
            sy < 0 ||
            sz < 0 ||
            sx >= width ||
            sy >= height ||
            sz >= depth
          ) {
            return;
          }
          const paletteIndex = data[indexFor(sx, sy, sz)];
          const sample = adjustedPalette[paletteIndex];
          if (!sample) {
            return;
          }
          const alpha = sample[3];
          if (alpha <= 0) {
            return;
          }
          const alphaWeight = weight * alpha;
          if (alphaWeight <= 0) {
            return;
          }
          const colorWeight = alphaWeight * alpha;
          accumR += sample[0] * colorWeight;
          accumG += sample[1] * colorWeight;
          accumB += sample[2] * colorWeight;
          totalColorWeight += colorWeight;
          accumAlpha += alpha * alphaWeight;
          totalAlphaWeight += alphaWeight;
        };

        addSample(x, y, z, BLEND_CENTER_WEIGHT);
        for (let step = 1; step <= radius; step += 1) {
          const weight = BLEND_CENTER_WEIGHT * Math.pow(BLEND_FALLOFF, step);
          addSample(x + step, y, z, weight);
          addSample(x - step, y, z, weight);
          addSample(x, y + step, z, weight);
          addSample(x, y - step, z, weight);
          addSample(x, y, z + step, weight);
          addSample(x, y, z - step, weight);
        }

        const base = indexFor(x, y, z) * 4;
        if (!totalColorWeight || !totalAlphaWeight) {
          blended[base] = 0;
          blended[base + 1] = 0;
          blended[base + 2] = 0;
          blended[base + 3] = 0;
          continue;
        }

        const invColor = 1 / totalColorWeight;
        blended[base] = clampByte(accumR * invColor * 255);
        blended[base + 1] = clampByte(accumG * invColor * 255);
        blended[base + 2] = clampByte(accumB * invColor * 255);
        const invAlpha = 1 / totalAlphaWeight;
        const alphaValue = accumAlpha * invAlpha;
        blended[base + 3] = clampByte(alphaValue * 255);
      }
    }
  }

  const texture = new THREE.Data3DTexture(blended, width, height, depth);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const buildVolumeResources = async (
  slices,
  onProgress,
  materialColorMap = MATERIAL_COLOR_MAP
) => {
  if (!slices?.length) return null;

  missingColorSamples.clear();

  const depth = slices.length;
  const palette = [];
  const paletteLookup = new Map();

  Object.values(materialColorMap).forEach((rgba) => {
    ensurePaletteEntry(paletteLookup, palette, rgba);
  });

  const depthStep = computeDownsampleStep(depth);
  const depthIndices = [];
  for (let z = 0; z < depth; z += depthStep) {
    depthIndices.push(z);
  }
  if (depthIndices[depthIndices.length - 1] !== depth - 1) {
    depthIndices.push(depth - 1);
  }
  const targetDepth = depthIndices.length;

  let width = 0;
  let height = 0;
  let targetWidth = 0;
  let targetHeight = 0;
  let xStep = 1;
  let yStep = 1;
  let data = null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error(
      "Unable to acquire 2D canvas context for volume processing."
    );
  }

  for (let targetZ = 0; targetZ < targetDepth; targetZ += 1) {
    const sourceIndex = depthIndices[targetZ];
    const asset = await decodeSlice(slices[sourceIndex]);

    if (!width) {
      width = asset.width;
      height = asset.height;
      xStep = computeDownsampleStep(width);
      yStep = computeDownsampleStep(height);
      targetWidth = Math.max(1, Math.ceil(width / xStep));
      targetHeight = Math.max(1, Math.ceil(height / yStep));
      canvas.width = width;
      canvas.height = height;
      data = new Uint8Array(targetWidth * targetHeight * targetDepth);
    } else if (asset.width !== width || asset.height !== height) {
      asset.close();
      throw new Error(
        `Slice ${sourceIndex} dimensions ${asset.width}x${asset.height} differ from initial ${width}x${height}`
      );
    }

    ctx.clearRect(0, 0, width, height);
    asset.draw(ctx);
    asset.close();

    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const localMissing = new Set();
    const sliceOffset = targetZ * targetWidth * targetHeight;

    for (let targetY = 0; targetY < targetHeight; targetY += 1) {
      const sourceY = Math.min(targetY * yStep, height - 1);
      const rowBase = sliceOffset + targetY * targetWidth;
      for (let targetX = 0; targetX < targetWidth; targetX += 1) {
        const sourceX = Math.min(targetX * xStep, width - 1);
        const pixelIndex = (sourceY * width + sourceX) * 4;
        const mapped = mapMaterialColor(
          pixels[pixelIndex],
          pixels[pixelIndex + 1],
          pixels[pixelIndex + 2],
          pixels[pixelIndex + 3],
          localMissing,
          materialColorMap
        );
        const paletteIndex = ensurePaletteEntry(paletteLookup, palette, mapped);
        data[rowBase + targetX] = paletteIndex;
      }
    }

    if (localMissing.size) {
      localMissing.forEach((key) => missingColorSamples.add(key));
    }

    if (onProgress) {
      onProgress(Math.round(((targetZ + 1) / targetDepth) * 100));
    }
  }

  if (!data) {
    throw new Error("Failed to build volume texture data.");
  }

  const volumeTexture = new THREE.Data3DTexture(
    data,
    targetWidth,
    targetHeight,
    targetDepth
  );
  volumeTexture.format = THREE.RedFormat;
  volumeTexture.type = THREE.UnsignedByteType;
  volumeTexture.minFilter = THREE.NearestFilter;
  volumeTexture.magFilter = THREE.NearestFilter;
  volumeTexture.unpackAlignment = 1;
  volumeTexture.needsUpdate = true;

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

  if (missingColorSamples.size) {
    console.warn(
      "[Volume] Sample of unmapped material colors:",
      Array.from(missingColorSamples).slice(0, MAX_LOGGED_MISSING)
    );
  }

  const clearPaletteIndex =
    CLEAR_PALETTE_ENTRY_KEY && paletteLookup.has(CLEAR_PALETTE_ENTRY_KEY)
      ? paletteLookup.get(CLEAR_PALETTE_ENTRY_KEY)
      : -1;

  const blendedVolumeTexture =
    BLEND_RADIUS_STEPS > 0
      ? createBlendedVolumeTexture(
          data,
          {
            width: targetWidth,
            height: targetHeight,
            depth: targetDepth,
          },
          palette,
          clearPaletteIndex,
          BLEND_RADIUS_STEPS
        )
      : null;

  return {
    volumeTexture,
    paletteTexture,
    paletteSize: palette.length,
    clearPaletteIndex,
    voxelDimensions: {
      width: targetWidth,
      height: targetHeight,
      depth: targetDepth,
    },
    blendedVolumeTexture,
    missingColors: Array.from(missingColorSamples),
  };
};

const volumeVertexShader = `
  #include <common>

  out vec3 vPosition;

  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const volumeFragmentShader = `
  precision highp float;
  precision highp sampler3D;

  #include <common>

  uniform sampler3D u_volume;
  uniform sampler2D u_palette;
  uniform float u_paletteSize;
  uniform float u_steps;
  uniform float u_clearIndex;
  uniform float u_clearAlphaScale;
  uniform mat4 u_modelMatrixInverse;
  uniform float u_yMax;
  uniform float u_useBlend;
  uniform sampler3D u_blendVolume;

  in vec3 vPosition;

  out vec4 outColor;

  const int MAX_STEPS = 2048;

  bool intersectBox(vec3 origin, vec3 dir, out float tNear, out float tFar) {
    vec3 boundsMin = vec3(-0.5);
    vec3 boundsMax = vec3(0.5);

    vec3 invDir = 1.0 / dir;
    vec3 t0s = (boundsMin - origin) * invDir;
    vec3 t1s = (boundsMax - origin) * invDir;

    vec3 tsmaller = min(t0s, t1s);
    vec3 tbigger = max(t0s, t1s);

    tNear = max(max(tsmaller.x, tsmaller.y), tsmaller.z);
    tFar = min(min(tbigger.x, tbigger.y), tbigger.z);

    if (tFar < 0.0 || tNear > tFar) {
      return false;
    }

    return true;
  }

  void main() {
    vec3 rayOrigin = (u_modelMatrixInverse * vec4(cameraPosition, 1.0)).xyz;
    vec3 rayDir = normalize(vPosition - rayOrigin);

    float tNear;
    float tFar;
    if (!intersectBox(rayOrigin, rayDir, tNear, tFar)) {
      discard;
    }

    tNear = max(tNear, 0.0);
    float tMax = tFar;
    if (tMax <= tNear) {
      discard;
    }

    int steps = clamp(int(u_steps), 1, MAX_STEPS);
    float segment = (tMax - tNear) / float(steps);

    vec3 samplePos = rayOrigin + rayDir * (tNear + 0.5 * segment);
    vec3 stepVec = rayDir * segment;

    vec4 accum = vec4(0.0);

    float paletteSize = max(u_paletteSize, 1.0);

    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= steps) {
        break;
      }

      vec3 texCoord = vec3(samplePos.x + 0.5, samplePos.y + 0.5, samplePos.z + 0.5);

      if (
        texCoord.x >= 0.0 && texCoord.x <= 1.0 &&
        texCoord.y >= 0.0 && texCoord.y <= 1.0 &&
        texCoord.z >= 0.0 && texCoord.z <= u_yMax
      ) {
        vec4 sampleColor;
        if (u_useBlend > 0.5) {
          sampleColor = texture(u_blendVolume, texCoord);
        } else {
          float raw = texture(u_volume, texCoord).r;
          float paletteIndex = clamp(
            floor(raw * 255.0 + 0.5),
            0.0,
            paletteSize - 1.0
          );
          float paletteU = (paletteIndex + 0.5) / paletteSize;
          sampleColor = texture(u_palette, vec2(paletteU, 0.5));
          if (u_clearIndex >= 0.0 && abs(paletteIndex - u_clearIndex) < 0.5) {
            sampleColor.a *= u_clearAlphaScale;
          }
        }

        float alpha = sampleColor.a;
        if (alpha > 0.0) {
          float weight = alpha * (1.0 - accum.a);
          accum.rgb += sampleColor.rgb * weight;
          accum.a += weight;
          if (accum.a >= 0.995) {
            break;
          }
        }
      }

      samplePos += stepVec;
    }

    if (accum.a <= 0.0) {
      discard;
    }

    outColor = accum;
  }
`;

const VolumeMesh = ({
  resources,
  scale,
  isInteracting,
  previewSteps,
  fullSteps,
  yMax,
  blendEnabled,
}) => {
  const meshRef = useRef();
  const material = useMemo(() => {
    if (!resources) return null;
    const shader = new THREE.ShaderMaterial({
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
      },
      vertexShader: volumeVertexShader,
      fragmentShader: volumeFragmentShader,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      glslVersion: THREE.GLSL3,
    });
    return shader;
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

const BoundingBoxOutline = ({ scale }) => {
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
        color="#000000"
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        linewidth={1}
      />
    </lineSegments>
  );
};

const CrossSectionOutline = ({ scale, yMax }) => {
  const geometry = useMemo(() => {
    const [scaleX, scaleY, scaleZ] = scale;
    const clamped = THREE.MathUtils.clamp(
      Number.isFinite(yMax) ? yMax : 1,
      0,
      1
    );
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

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geom;
  }, [scale, yMax]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={55}>
      <lineBasicMaterial
        color="#000000"
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        linewidth={1}
      />
    </lineSegments>
  );
};

const CrossSectionFill = ({ scale, yMax }) => {
  const [scaleX, scaleY, scaleZ] = scale;
  const texture = useMemo(() => {
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

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
  }, []);

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

const parseColorKey = (key) =>
  key.split(" ").map((chunk) => {
    const value = Number.parseInt(chunk, 10);
    return Number.isFinite(value) ? value : 0;
  });

const MaterialMappingModal = ({
  missingColors,
  selections,
  onSelect,
  onConfirm,
  onCancel,
  materials,
  canConfirm,
}) => {
  if (!missingColors.length) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          padding: "20px 24px",
          borderRadius: 8,
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: "#1f1f1f" }}>
            Map Unknown Materials
          </span>
          <span style={{ fontSize: 13, color: "#4f4f4f" }}>
            Choose a known material that should replace each unmapped color.
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {missingColors.map((key) => {
            const [r, g, b, a] = parseColorKey(key);
            const rgbaPreview = `rgba(${r}, ${g}, ${b}, ${
              Math.round((a / 255) * 100) / 100
            })`;
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "10px 12px",
                  borderRadius: 6,
                  background: "#f7f7f7",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#1f1f1f",
                    }}
                  >
                    Source: {key}
                  </span>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 4,
                      background: rgbaPreview,
                      border: "1px solid rgba(0, 0, 0, 0.2)",
                    }}
                  />
                </div>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    color: "#3f3f3f",
                  }}
                >
                  <span>Map to material</span>
                  <select
                    value={selections[key] || ""}
                    onChange={(event) => onSelect(key, event.target.value)}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #d0d0d0",
                      fontSize: 12,
                    }}
                  >
                    <option value="" disabled>
                      Select a material…
                    </option>
                    {materials.map(({ key: materialKey, name }) => (
                      <option key={materialKey} value={materialKey}>
                        {name} ({materialKey})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "1px solid #c0c0c0",
              background: "#ffffff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              padding: "6px 12px",
              borderRadius: 4,
              border: "none",
              background: canConfirm ? "#2463eb" : "#9fb4f5",
              color: "#ffffff",
              fontSize: 12,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            Apply mapping
          </button>
        </div>
      </div>
    </div>
  );
};

const VolumeStage = ({
  slices,
  scale,
  isInteracting,
  previewSteps,
  fullSteps,
  yMax,
  onStatsChange,
  blendEnabled,
  materialColorMap,
  onMissingMaterials,
}) => {
  const [resources, setResources] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const resourcesRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const disposeCurrent = () => {
      if (resourcesRef.current) {
        resourcesRef.current.volumeTexture.dispose();
        resourcesRef.current.paletteTexture.dispose();
        if (resourcesRef.current.blendedVolumeTexture) {
          resourcesRef.current.blendedVolumeTexture.dispose();
        }
        resourcesRef.current = null;
      }
      setResources(null);
      if (onStatsChange) {
        onStatsChange(null);
      }
    };

    disposeCurrent();
    if (onMissingMaterials) {
      onMissingMaterials([]);
    }
    setProgress(0);
    setError(null);

    if (!slices || !slices.length) {
      setLoading(false);
      if (onMissingMaterials) {
        onMissingMaterials([]);
      }
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    const load = async () => {
      try {
        const built = await buildVolumeResources(
          slices,
          (pct) => {
            if (!cancelled) {
              setProgress(pct);
            }
          },
          materialColorMap
        );

        if (!built) {
          throw new Error("Volume data generation returned empty result.");
        }

        if (cancelled) {
          built.volumeTexture.dispose();
          built.paletteTexture.dispose();
          if (built.blendedVolumeTexture) {
            built.blendedVolumeTexture.dispose();
          }
          return;
        }

        resourcesRef.current = built;
        setResources(built);
        setProgress(100);
        if (onMissingMaterials) {
          onMissingMaterials(built.missingColors || []);
        }
        if (onStatsChange) {
          const { voxelDimensions, paletteSize } = built;
          const voxelCount =
            voxelDimensions.width *
            voxelDimensions.height *
            voxelDimensions.depth;
          const blendedBytes = built.blendedVolumeTexture ? voxelCount * 4 : 0;
          const byteSize = voxelCount + paletteSize * 4 + blendedBytes;
          onStatsChange({
            voxelDimensions,
            paletteSize,
            voxelCount,
            byteSize,
          });
        }
      } catch (err) {
        console.error("[Volume] Failed to construct 3D texture", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          if (onMissingMaterials) {
            onMissingMaterials([]);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [slices, materialColorMap, onMissingMaterials]);

  useEffect(() => {
    return () => {
      if (resourcesRef.current) {
        resourcesRef.current.volumeTexture.dispose();
        resourcesRef.current.paletteTexture.dispose();
        if (resourcesRef.current.blendedVolumeTexture) {
          resourcesRef.current.blendedVolumeTexture.dispose();
        }
        resourcesRef.current = null;
      }
      if (onStatsChange) {
        onStatsChange(null);
      }
    };
  }, [onStatsChange]);

  const showCrossSection = yMax < 0.999;

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <BoundingBoxOutline scale={scale} />
      {showCrossSection && <CrossSectionFill scale={scale} yMax={yMax} />}
      {showCrossSection && <CrossSectionOutline scale={scale} yMax={yMax} />}
      {resources && (
        <VolumeMesh
          resources={resources}
          scale={scale}
          isInteracting={isInteracting}
          previewSteps={previewSteps}
          fullSteps={fullSteps}
          yMax={yMax}
          blendEnabled={blendEnabled}
        />
      )}
      {!resources && loading && (
        <Html position={[0, 0, 0]} transform center>
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(0, 0, 0, 0.6)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            Building volume… {progress}%
          </div>
        </Html>
      )}
      {error && (
        <Html position={[0, 0, 0]} transform center>
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(128, 0, 0, 0.85)",
              color: "#fff",
              borderRadius: 4,
              fontSize: 12,
              maxWidth: 220,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        </Html>
      )}
    </group>
  );
};

export const VoxelPreview = ({ config }) => {
  const {
    SliceWidth,
    SliceHeight,
    XDpi,
    YDpi,
    SliceThicknessNanoMeter,
    slices,
  } = config;

  const sliceWidthPx = Number(SliceWidth) || 0;
  const sliceHeightPx = Number(SliceHeight) || 0;
  const xDpi = Number(XDpi) || 1;
  const yDpi = Number(YDpi) || 1;
  const sliceCount = slices?.length || 0;

  const widthM = sliceWidthPx * (inchToMeter / xDpi);
  const heightM = sliceHeightPx * (inchToMeter / yDpi);

  const sliceThicknessM =
    (Number(SliceThicknessNanoMeter) || 0) * 1e-9 ||
    inchToMeter / Math.max(xDpi, yDpi, 1);

  const depthM = sliceThicknessM * sliceCount;
  const safeDepthM =
    depthM > 0 ? depthM : Math.max(widthM, heightM, 0.001) * 0.01 || 0.001;

  const volumeScale = useMemo(
    () => [
      Math.max(widthM, 0.001),
      Math.max(heightM, 0.001),
      Math.max(safeDepthM, 0.001),
    ],
    [widthM, heightM, safeDepthM]
  );

  const diag = Math.max(0.1, Math.hypot(widthM, heightM, safeDepthM));
  const camPos = [0, diag * 1.1, diag * 1.35];

  const baseFullSteps = useMemo(() => {
    if (!sliceCount) return 128;
    const longestAxis = Math.max(sliceWidthPx, sliceHeightPx, sliceCount);
    const target = Math.round(longestAxis * 0.35);
    return Math.min(768, Math.max(96, target));
  }, [sliceCount, sliceWidthPx, sliceHeightPx]);

  const [qualityPct, setQualityPct] = useState(100);
  const fullSteps = useMemo(() => {
    const scaled = Math.round(baseFullSteps * (qualityPct / 100));
    return Math.min(1024, Math.max(48, scaled));
  }, [baseFullSteps, qualityPct]);

  const previewSteps = useMemo(() => {
    const proposed = Math.round(fullSteps * 0.5);
    const limited = Math.max(32, proposed);
    if (limited >= fullSteps) {
      return Math.max(32, fullSteps - 16);
    }
    return limited;
  }, [fullSteps]);

  const [isInteracting, setIsInteracting] = useState(false);
  const interactionTimeout = useRef(null);
  const [yMax, setYMax] = useState(1);
  const [stats, setStats] = useState(null);
  const [fps, setFps] = useState(null);
  const [blendEnabled, setBlendEnabled] = useState(true);
  const [materialColorMap, setMaterialColorMap] = useState(() => ({
    ...MATERIAL_COLOR_MAP,
  }));
  const [pendingMissingColors, setPendingMissingColors] = useState([]);
  const [materialSelectionDraft, setMaterialSelectionDraft] = useState({});
  const [mappingModalVisible, setMappingModalVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (interactionTimeout.current) {
        clearTimeout(interactionTimeout.current);
        interactionTimeout.current = null;
      }
    };
  }, []);

  const handleMissingMaterials = useCallback((missingKeys) => {
    if (missingKeys && missingKeys.length) {
      setPendingMissingColors(missingKeys);
      setMaterialSelectionDraft((prev) => {
        const next = {};
        missingKeys.forEach((key) => {
          next[key] = prev[key] || "";
        });
        return next;
      });
      setMappingModalVisible(true);
    } else {
      setPendingMissingColors([]);
      setMaterialSelectionDraft({});
      setMappingModalVisible(false);
    }
  }, []);

  const handleMaterialSelectionChange = useCallback((missingKey, mappedKey) => {
    setMaterialSelectionDraft((prev) => ({
      ...prev,
      [missingKey]: mappedKey,
    }));
  }, []);

  const canApplyMaterialMappings = useMemo(() => {
    if (!pendingMissingColors.length) {
      return false;
    }
    return pendingMissingColors.every(
      (key) => materialSelectionDraft[key] && materialSelectionDraft[key].length
    );
  }, [pendingMissingColors, materialSelectionDraft]);

  const handleApplyMaterialMappings = useCallback(() => {
    if (!pendingMissingColors.length) {
      return;
    }
    setMaterialColorMap((prev) => {
      const next = { ...prev };
      pendingMissingColors.forEach((missingKey) => {
        const mappedKey = materialSelectionDraft[missingKey];
        if (!mappedKey) {
          return;
        }
        const source =
          prev[mappedKey] ||
          MATERIAL_COLOR_MAP[mappedKey] ||
          MATERIAL_LOOKUP[mappedKey]?.rgba;
        if (source) {
          next[missingKey] = [...source];
        }
      });
      return next;
    });
    setPendingMissingColors([]);
    setMaterialSelectionDraft({});
    setMappingModalVisible(false);
  }, [materialSelectionDraft, pendingMissingColors]);

  const handleModalClose = useCallback(() => {
    setMappingModalVisible(false);
  }, []);

  const markInteracting = () => {
    setIsInteracting((prev) => (prev ? prev : true));
    if (interactionTimeout.current) {
      clearTimeout(interactionTimeout.current);
    }
    interactionTimeout.current = setTimeout(() => {
      setIsInteracting(false);
      interactionTimeout.current = null;
    }, 220);
  };

  const handleFpsUpdate = useCallback((value) => {
    setFps((prev) => (prev === value ? prev : value));
  }, []);

  const statsSummary = useMemo(() => {
    if (!stats) return null;
    const {
      voxelDimensions: { width, height, depth },
      voxelCount,
      byteSize,
      paletteSize,
    } = stats;
    return {
      voxelDimensionsLabel: `${width} × ${height} × ${depth}`,
      voxelCount,
      byteSize,
      paletteSize,
    };
  }, [stats]);

  const qualityLabel = useMemo(() => {
    if (qualityPct <= 75) return "Draft";
    if (qualityPct >= 125) return "High";
    return "Balanced";
  }, [qualityPct]);

  const materialsForSelection = MATERIAL_DEFINITIONS;
  const showMappingModal =
    mappingModalVisible && pendingMissingColors.length > 0;

  return (
    <>
      {showMappingModal && (
        <MaterialMappingModal
          missingColors={pendingMissingColors}
          selections={materialSelectionDraft}
          onSelect={handleMaterialSelectionChange}
          onConfirm={handleApplyMaterialMappings}
          onCancel={handleModalClose}
          materials={materialsForSelection}
          canConfirm={canApplyMaterialMappings}
        />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 16,
        }}
      >
        <div style={{ flex: "1 1 auto" }}>
          <Canvas
            camera={{
              position: camPos,
              fov: 50,
              near: 0.01,
              far: Math.max(diag * 6, 10_000),
            }}
            style={{ width: "100%", height: "80vh", background: "#ffffff" }}
            onCreated={({ gl, scene, camera }) => {
              gl.setClearColor("#ffffff", 1);
              scene.background = new THREE.Color("#ffffff");
              camera.lookAt(0, 0, 0);
            }}
          >
            <OrbitControls
              makeDefault
              target={[0, 0, 0]}
              onStart={markInteracting}
              onChange={markInteracting}
              onEnd={markInteracting}
            />

            <Environment preset="city" />
            <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
              <GizmoViewport
                axisColors={["#9d4b4b", "#2f7f4f", "#3b5b9d"]}
                labelColor="white"
              />
            </GizmoHelper>

            {/* <Grid
              cellSize={0.01}
              sectionSize={Math.max(widthM, heightM) * 2}
              cellColor="#6f6f6f"
              sectionColor="#9d4b4b"
              fadeDistance={1000}
              position={[0, 0, 0]}
              infiniteGrid
            /> */}

            <ambientLight intensity={1} />
            <directionalLight position={[2, 4, 3]} intensity={1} />

            <FrameRateTracker onUpdate={handleFpsUpdate} />
            <VolumeStage
              slices={slices}
              scale={volumeScale}
              isInteracting={isInteracting}
              previewSteps={previewSteps}
              fullSteps={fullSteps}
              yMax={yMax}
              onStatsChange={setStats}
              blendEnabled={blendEnabled}
              materialColorMap={materialColorMap}
              onMissingMaterials={handleMissingMaterials}
            />
          </Canvas>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            alignItems: "stretch",
            padding: "0 8px",
            gap: 16,
            width: 220,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: "1 1 auto",
            }}
          >
            <span style={{ fontSize: 12, color: "#3f3f3f", marginBottom: 8 }}>
              Top
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={yMax}
              onChange={(event) => {
                const raw = parseFloat(event.target.value);
                if (Number.isFinite(raw)) {
                  setYMax(Math.max(0, Math.min(1, raw)));
                }
              }}
              style={{
                writingMode: "bt-lr",
                WebkitAppearance: "slider-vertical",
                width: "auto",
                height: "60vh",
              }}
              aria-label="Y-axis cross-section"
            />
            <span style={{ fontSize: 12, color: "#3f3f3f", marginTop: 8 }}>
              Bottom
            </span>
          </div>

          {pendingMissingColors.length > 0 && !mappingModalVisible && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                background: "#fff4d6",
                borderRadius: 6,
                padding: "8px 10px",
                border: "1px solid #f2c97d",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#8a5400",
                }}
              >
                {pendingMissingColors.length} unmapped material
                {pendingMissingColors.length > 1 ? "s" : ""} detected
              </span>
              <button
                type="button"
                onClick={() => setMappingModalVisible(true)}
                style={{
                  alignSelf: "flex-start",
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "none",
                  background: "#f2a100",
                  color: "#ffffff",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Map materials
              </button>
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <label
              htmlFor="quality-slider"
              style={{ fontSize: 13, color: "#1f1f1f", fontWeight: 600 }}
            >
              Quality
            </label>
            <input
              id="quality-slider"
              type="range"
              min="50"
              max="150"
              step="5"
              value={qualityPct}
              onChange={(event) => {
                const raw = parseFloat(event.target.value);
                if (Number.isFinite(raw)) {
                  setQualityPct(Math.max(50, Math.min(150, raw)));
                }
              }}
            />
            <span style={{ fontSize: 12, color: "#3f3f3f" }}>
              {qualityLabel} · {qualityPct}% · {fullSteps} steps
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <label
              htmlFor="blend-toggle"
              style={{ fontSize: 13, color: "#1f1f1f", fontWeight: 600 }}
            >
              Blending Preview
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <input
                id="blend-toggle"
                type="checkbox"
                checked={blendEnabled}
                onChange={(event) => {
                  setBlendEnabled(event.target.checked);
                }}
              />
              <span style={{ fontSize: 12, color: "#3f3f3f" }}>
                Blend neighbours (radius {BLEND_RADIUS_STEPS})
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              background: "#f5f5f5",
              borderRadius: 6,
              padding: "8px 10px",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1f1f1f" }}>
              Runtime Stats
            </span>
            <span style={{ fontSize: 12, color: "#3f3f3f" }}>
              FPS: {fps ? `${fps}` : "—"}
            </span>
            <span style={{ fontSize: 12, color: "#3f3f3f" }}>
              Memory: {statsSummary ? formatBytes(statsSummary.byteSize) : "—"}
            </span>
            {statsSummary && (
              <>
                <span style={{ fontSize: 12, color: "#3f3f3f" }}>
                  Voxels: {statsSummary.voxelDimensionsLabel}
                </span>
                <span style={{ fontSize: 12, color: "#3f3f3f" }}>
                  Total voxels: {statsSummary.voxelCount.toLocaleString()}
                </span>
                <span style={{ fontSize: 12, color: "#3f3f3f" }}>
                  Palette entries: {statsSummary.paletteSize}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
