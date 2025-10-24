export const volumeVertexShader = `
  #include <common>

  out vec3 vPosition;

  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const volumeFragmentShader = `
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
  uniform float u_alphaImpact;

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

        float alphaBase = clamp(sampleColor.a, 0.0, 1.0);
        float alpha = alphaBase > 0.0
          ? pow(alphaBase, max(u_alphaImpact, 0.01))
          : 0.0;
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
