import React, { useMemo, useEffect, useState, useRef } from "react";
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
const MATERIAL_COLOR_MAP = {
  "0 255 255 255": [0, 255, 255, 140], // VeroCY-V
  "255 0 255 255": [255, 0, 255, 200], // VeroMGT-V
  "255 255 0 255": [255, 255, 0, 100], // VeroYL-C
  "0 0 0 255": [0, 0, 0, 0], // VOID
  "137 137 137 255": [137, 137, 137, 1], // Clear
  "255 255 255 255": [255, 255, 255, 255], // White
};

const MAX_LOGGED_MISSING = 8;
const MAX_PALETTE_SIZE = 256;
const missingColorSamples = new Set();
const TARGET_AXIS_RESOLUTION = 256;

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

const mapMaterialColor = (r, g, b, a, localMissing) => {
  const key = `${r} ${g} ${b} ${a}`;
  const mapped = MATERIAL_COLOR_MAP[key];
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

const buildVolumeResources = async (slices, onProgress) => {
  if (!slices?.length) return null;

  missingColorSamples.clear();

  const depth = slices.length;
  const palette = [];
  const paletteLookup = new Map();

  Object.values(MATERIAL_COLOR_MAP).forEach((rgba) => {
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
    throw new Error("Unable to acquire 2D canvas context for volume processing.");
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
          localMissing
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

  return {
    volumeTexture,
    paletteTexture,
    paletteSize: palette.length,
    voxelDimensions: {
      width: targetWidth,
      height: targetHeight,
      depth: targetDepth,
    },
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
  uniform mat4 u_modelMatrixInverse;

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
        texCoord.z >= 0.0 && texCoord.z <= 1.0
      ) {
        float raw = texture(u_volume, texCoord).r;
        float paletteIndex = clamp(floor(raw * 255.0 + 0.5), 0.0, paletteSize - 1.0);
        float paletteU = (paletteIndex + 0.5) / paletteSize;
        vec4 sampleColor = texture(u_palette, vec2(paletteU, 0.5));

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
        u_modelMatrixInverse: { value: new THREE.Matrix4() },
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
      material.uniforms.u_steps.value = isInteracting ? previewSteps : fullSteps;
    }
  }, [material, isInteracting, previewSteps, fullSteps]);

  if (!resources || !material) {
    return null;
  }

  return (
    <mesh ref={meshRef} material={material} scale={scale}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
};

const VolumeStage = ({
  slices,
  scale,
  isInteracting,
  previewSteps,
  fullSteps,
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
        resourcesRef.current = null;
      }
      setResources(null);
    };

    disposeCurrent();
    setProgress(0);
    setError(null);

    if (!slices || !slices.length) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    const load = async () => {
      try {
        const built = await buildVolumeResources(slices, (pct) => {
          if (!cancelled) {
            setProgress(pct);
          }
        });

        if (!built) {
          throw new Error("Volume data generation returned empty result.");
        }

        if (cancelled) {
          built.volumeTexture.dispose();
          built.paletteTexture.dispose();
          return;
        }

        resourcesRef.current = built;
        setResources(built);
        setProgress(100);
      } catch (err) {
        console.error("[Volume] Failed to construct 3D texture", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
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
  }, [slices]);

  useEffect(() => {
    return () => {
      if (resourcesRef.current) {
        resourcesRef.current.volumeTexture.dispose();
        resourcesRef.current.paletteTexture.dispose();
        resourcesRef.current = null;
      }
    };
  }, []);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {resources && (
        <VolumeMesh
          resources={resources}
          scale={scale}
          isInteracting={isInteracting}
          previewSteps={previewSteps}
          fullSteps={fullSteps}
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

  const diag = Math.max(
    0.1,
    Math.hypot(widthM, heightM, safeDepthM)
  );
  const camPos = [0, diag * 1.1, diag * 1.35];

  const fullSteps = useMemo(() => {
    if (!sliceCount) return 128;
    const longestAxis = Math.max(sliceWidthPx, sliceHeightPx, sliceCount);
    const target = Math.round(longestAxis * 0.35);
    return Math.min(768, Math.max(96, target));
  }, [sliceCount, sliceWidthPx, sliceHeightPx]);

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

  useEffect(() => {
    return () => {
      if (interactionTimeout.current) {
        clearTimeout(interactionTimeout.current);
        interactionTimeout.current = null;
      }
    };
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

  return (
    <Canvas
      camera={{ position: camPos, fov: 50, near: 0.01, far: Math.max(diag * 6, 10_000) }}
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

      <VolumeStage
        slices={slices}
        scale={volumeScale}
        isInteracting={isInteracting}
        previewSteps={previewSteps}
        fullSteps={fullSteps}
      />
    </Canvas>
  );
};
