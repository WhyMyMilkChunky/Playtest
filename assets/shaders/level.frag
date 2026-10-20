#version 460 core

#include "include/s3d_backend.glsl"
#include "include/s3d_pixel_grid.glsl"
#include "include/game_blood_ink.glsl"
#include "include/game_blood_material.glsl"
#include "include/game_reflection.glsl"
#include "include/game_surface_frame.glsl"
#include "include/game_facet_relay.glsl"

// Opaque world surfaces never discard or replace depth. Reject hidden pixels
// before material, stain, lighting and shadow work.
layout(early_fragment_tests) in;

layout(location = 0) out vec4 FragColor;

#if defined(S3D_VULKAN)
#define u_hdrOutput false
#else
uniform bool u_hdrOutput;
#endif

#if defined(S3D_VULKAN)
#include "include/game_world_gpu.glsl"
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 instanceColor;
layout(location = 3) in vec2 boxUv;
layout(location = 4) flat in int materialIndex;
layout(location = 5) in float bakedAmbientOcclusion;
layout(location = 6) flat in vec2 bakedAoFaceSize;
layout(location = 7) flat in int worldChunkIndex;
layout(location = 8) in vec3 texturePosition;

#define u_sunDirection worldFrame.sunDirection.xyz
#define u_cameraPosition worldFrame.cameraPosition.xyz
#define u_bloodInkEnabled int(worldFrame.cameraPosition.w)
#define u_fogColor worldFrame.fogColor.xyz
#define u_fogNear worldFrame.renderSettings.x
#define u_fogFar worldFrame.renderSettings.y
#define u_normalStrength worldFrame.renderSettings.z
#define u_specularStrength worldFrame.renderSettings.w
#define u_aoEnabled int(worldFrame.aoSettings.x)
#define u_aoRadius worldFrame.aoSettings.y
#define u_aoStrength worldFrame.aoSettings.z
#define u_fullbright int(worldFrame.aoSettings.w)
#define u_floorMaterial worldFrame.materialIds0.x
#define u_wallMaterial worldFrame.materialIds0.y
#define u_ceilingMaterial worldFrame.materialIds0.z
#define u_panelMaterial worldFrame.materialIds0.w
#define u_structuralMaterials worldFrame.structuralMaterials
#define u_emissiveImageMaterials worldFrame.emissiveImageMaterials
#define u_doorLeftMaterial worldFrame.materialIds1.x
#define u_doorRightMaterial worldFrame.materialIds1.y
#define u_fixedPuzzleFirstMaterial worldFrame.materialIds1.z
#define u_fixedPuzzleLastMaterial worldFrame.materialIds1.w
#define u_emissiveMaterial worldFrame.counts.x
#define u_shadowBias worldFrame.shadowSettings.x
#define u_shadowDarkness worldFrame.shadowSettings.y
#define u_softShadows int(worldFrame.shadowSettings.z)
#define u_fastSpecular int(worldFrame.shadowSettings.w)
#define u_surfaceFlags worldFrame.counts.z
#else
in vec3 position;
in vec3 texturePosition;
in vec3 normal;
in vec3 instanceColor;
in vec2 boxUv;
flat in int materialIndex;
in float bakedAmbientOcclusion;
flat in vec2 bakedAoFaceSize;
flat in vec4 fxgiChart;
flat in vec4 fxgiUvBounds;
uniform int u_fxgiEnabled;
uniform int u_fxgiIndirectOnly;
uniform float u_fxgiStrength;
uniform int u_fxgiDebugRawIrradiance;
uniform float u_fxgiDebugExposure;
layout(binding = 6) uniform sampler2D u_fxgiAtlas;
layout(binding = 9) uniform sampler2DArray u_fxgiDirectMaps;
uniform int u_fxgiDirectEnabled;
uniform int u_fxgiDirectSlots[24];

uniform vec3 u_sunDirection;
uniform vec3 u_cameraPosition;
uniform vec3 u_fogColor;
uniform float u_fogNear;
uniform float u_fogFar;
uniform float u_normalStrength;
uniform float u_specularStrength;
uniform int u_fastSpecular;
uniform int u_surfaceFlags;
uniform int u_aoEnabled;
uniform float u_aoRadius;
uniform float u_aoStrength;
uniform int u_floorMaterial;
uniform int u_wallMaterial;
uniform int u_ceilingMaterial;
uniform int u_panelMaterial;
uniform int u_structuralMaterials[4];
uniform int u_emissiveImageMaterials[4];
uniform int u_doorLeftMaterial;
uniform int u_doorRightMaterial;
uniform int u_fixedPuzzleFirstMaterial;
uniform int u_fixedPuzzleLastMaterial;
uniform int u_emissiveMaterial;
uniform int u_fullbright;
uniform int u_chunkLightCount;
uniform vec2 u_lightingLodRange;
uniform int u_lightingLodMode;
uniform int u_distantLightCount;
uniform int u_chunkFlashlightIndex;
uniform int u_chunkLightIndices[24];
uniform vec3 u_lightPositions[24];
uniform vec3 u_lightFalloffs[24];
uniform vec3 u_lightColors[24];
uniform vec3 u_lightDirections[24];
uniform vec4 u_lightParameters[24];
uniform int u_lightShadowSlots[24];
uniform vec3 u_shadowLightPositions[24];
uniform float u_shadowFarPlanes[24];
uniform float u_shadowBias;
uniform float u_shadowDarkness;
uniform int u_softShadows;
uniform int u_staticShadowSlots[24];
uniform samplerCubeArray u_staticShadowMaps;
uniform int u_bloodInkEnabled;
// Static 4x4x4 cells contain exact 24-bit candidate masks in R32F texels.
// The CPU remaps those bits to the current ranked light packet once per chunk.
layout(binding = 8) uniform samplerBuffer u_spatialLightGrid;
uniform int u_chunkGridOffset;
uniform vec3 u_chunkGridMinimum;
uniform vec3 u_chunkGridScale;
uniform int u_chunkGridSelectedMask;
uniform int u_chunkGridUncachedMask;
uniform int u_chunkGridLightSlots[24];
#endif

S3D_RESOURCE(1, 0) uniform sampler2DArray u_albedoMaps;
S3D_RESOURCE(1, 1) uniform sampler2DArray u_normalMaps;
S3D_RESOURCE(1, 2) uniform sampler2DArray u_surfaceMaps;
S3D_RESOURCE(2, 4) uniform samplerCubeArray u_shadowMaps;

int ChunkLightCount()
{
#if defined(S3D_VULKAN)
	return worldChunkIndex < 0 ? worldFrame.counts.y :
		worldChunks[worldChunkIndex].header.x;
#else
	return u_chunkLightCount;
#endif
}

int ChunkLightIndex(int index)
{
#if defined(S3D_VULKAN)
	if (worldChunkIndex < 0) return index;
	ivec4 packed = worldChunks[worldChunkIndex].lightIndices[index / 4];
	return packed[index & 3];
#else
	return u_chunkLightIndices[index];
#endif
}

uvec2 WorldLightMasks(vec3 lightingPosition, bool projectedUv)
{
#if !defined(S3D_VULKAN)
	if (u_chunkGridOffset >= 0 && projectedUv)
	{
		vec3 gridPosition = (lightingPosition - u_chunkGridMinimum) * u_chunkGridScale;
		ivec3 cell = ivec3(clamp(floor(gridPosition), vec3(0.0), vec3(3.0)));
		int address = u_chunkGridOffset + cell.x + cell.y * 4 + cell.z * 16;
		uint cached = uint(texelFetch(u_spatialLightGrid, address).r);
		return uvec2(cached & uint(u_chunkGridSelectedMask), uint(u_chunkGridUncachedMask));
	}
#endif
	return uvec2(0u, (1u << uint(ChunkLightCount())) - 1u);
}

int PopWorldLight(inout uvec2 masks)
{
	if (masks.x != 0u)
	{
		int cachedSlot = findLSB(masks.x);
		masks.x &= masks.x - 1u;
#if !defined(S3D_VULKAN)
		return u_chunkGridLightSlots[cachedSlot];
#endif
	}
	int rank = findLSB(masks.y);
	masks.y &= masks.y - 1u;
	return rank;
}

vec3 LightPosition(int index)
{
#if defined(S3D_VULKAN)
	return worldFrame.lights[index].position.xyz;
#else
	return u_lightPositions[index];
#endif
}

vec3 LightFalloff(int index)
{
#if defined(S3D_VULKAN)
	return vec3(worldFrame.lights[index].color.w, worldFrame.lights[index].direction.w,
		worldFrame.lights[index].position.w);
#else
	return u_lightFalloffs[index];
#endif
}

vec3 LightColor(int index)
{
#if defined(S3D_VULKAN)
	return worldFrame.lights[index].color.xyz;
#else
	return u_lightColors[index];
#endif
}

vec3 LightDirection(int index)
{
#if defined(S3D_VULKAN)
	return worldFrame.lights[index].direction.xyz;
#else
	return u_lightDirections[index];
#endif
}

vec4 LightParameters(int index)
{
#if defined(S3D_VULKAN)
	return worldFrame.lights[index].parameters;
#else
	return u_lightParameters[index];
#endif
}

int LightShadowSlot(int index)
{
#if defined(S3D_VULKAN)
	return worldFrame.lights[index].shadow.x;
#else
	return u_lightShadowSlots[index];
#endif
}

vec4 ShadowPositionFar(int slot)
{
#if defined(S3D_VULKAN)
	return worldFrame.shadowPositionFar[slot];
#else
	return vec4(u_shadowLightPositions[slot], u_shadowFarPlanes[slot]);
#endif
}

vec3 SurfaceReflection(vec3 lightColor, vec3 normalValue, vec3 tangentValue,
	vec3 bitangentValue, vec3 viewDirection, vec3 lightDirection,
	float strength, vec3 fastResponse, vec3 detailedResponse, float normalView, float viewMask)
{
	if (strength <= 0.0 || all(lessThanEqual(lightColor, vec3(0.0)))) return vec3(0.0);
	if (u_fastSpecular != 0)
		return FastSurfaceReflection(lightColor, normalValue, viewDirection,
			lightDirection, fastResponse, strength);
	return BeckmannReflection(lightColor, normalValue, tangentValue,
		bitangentValue, viewDirection, lightDirection, detailedResponse, normalView, viewMask, strength);
}

vec3 ShadowTexelRay(vec3 ray, float resolution)
{
	vec3 absolute = abs(ray);
	if (absolute.x >= max(absolute.y, absolute.z))
	{
		vec2 uv = ray.yz / absolute.x * 0.5 + 0.5;
		vec2 centre = (floor(clamp(uv, 0.0, 0.999999) * resolution) + 0.5) / resolution * 2.0 - 1.0;
		return vec3(sign(ray.x), centre);
	}
	if (absolute.y >= absolute.z)
	{
		vec2 uv = ray.xz / absolute.y * 0.5 + 0.5;
		vec2 centre = (floor(clamp(uv, 0.0, 0.999999) * resolution) + 0.5) / resolution * 2.0 - 1.0;
		return vec3(centre.x, sign(ray.y), centre.y);
	}
	vec2 uv = ray.xy / max(absolute.z, 0.001) * 0.5 + 0.5;
	vec2 centre = (floor(clamp(uv, 0.0, 0.999999) * resolution) + 0.5) / resolution * 2.0 - 1.0;
	return vec3(centre, sign(ray.z));
}

float ReceiverPlaneDepth(float planeDistance, float fallbackDistance,
	vec3 geometricNormal, vec3 sampleRay)
{
	float denominator = dot(normalize(sampleRay), geometricNormal);
	if (abs(denominator) < 0.005) return fallbackDistance;
	float depth = planeDistance / denominator;
	return depth > 0.0 ? depth : fallbackDistance;
}

float ShadowCompare(samplerCubeArray shadowMap, int slot, vec3 sampleDirection,
	float receiverDepth, float farPlane, float bias, float worldTexel)
{
	float storedDepth = textureLod(shadowMap, vec4(sampleDirection, float(slot)), 0.0).r * farPlane;
	// A small continuous transition also softens nearest-depth texel boundaries.
	return smoothstep(-worldTexel * 0.08, worldTexel * 0.08,
		storedDepth - receiverDepth + bias);
}

float SamplePointShadow(samplerCubeArray shadowMap, int slot, vec4 lightPositionFar,
	vec3 worldPosition, vec3 geometricNormal, vec3 lightDirection, float detailWeight)
{
	if (slot < 0) return 1.0;
	vec3 fromLight = worldPosition - lightPositionFar.xyz;
	float receiverDistance = length(fromLight);
	if (receiverDistance < 0.001) return 1.0;
	float resolution = float(textureSize(shadowMap, 0).x);
	float worldTexel = max(receiverDistance, 0.001) * (2.0 / resolution);
	float grazing = 1.0 - max(dot(geometricNormal, lightDirection), 0.0);
	fromLight += geometricNormal * worldTexel * mix(0.08, 0.24, grazing);
	float currentDepth = length(fromLight);
	float planeDistance = dot(fromLight, geometricNormal);
	float bias = u_shadowBias + worldTexel * mix(0.08, 0.28, grazing);
	if (u_softShadows == 0 || detailWeight <= 0.0)
	{
		vec3 sampleRay = ShadowTexelRay(fromLight, resolution);
		float depth = ReceiverPlaneDepth(planeDistance, currentDepth, geometricNormal, sampleRay);
		return mix(u_shadowDarkness, 1.0, ShadowCompare(shadowMap, slot,
			sampleRay, depth, lightPositionFar.w, bias, worldTexel));
	}
	vec3 direction = fromLight / max(currentDepth, 0.001);
	vec3 reference = abs(direction.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
	vec3 tangent = normalize(cross(direction, reference));
	vec3 bitangent = cross(direction, tangent);
	float lit = 0.0;
	for (int tap = 0; tap < 4; ++tap)
	{
		vec2 offset = vec2((tap & 1) == 0 ? -1.0 : 1.0, (tap & 2) == 0 ? -1.0 : 1.0);
		vec3 sampleDirection = fromLight + (tangent * offset.x + bitangent * offset.y) * worldTexel * 0.55 * detailWeight;
		// Stored radial depth belongs to the cubemap texel's centre ray. Match
		// that ray and the receiver plane to avoid a repeating self-shadow grid.
		sampleDirection = ShadowTexelRay(sampleDirection, resolution);
		float receiverDepth = ReceiverPlaneDepth(planeDistance, currentDepth,
			geometricNormal, sampleDirection);
		lit += ShadowCompare(shadowMap, slot, sampleDirection, receiverDepth,
			lightPositionFar.w, bias, worldTexel) * 0.25;
	}
	return mix(u_shadowDarkness, 1.0, lit);
}

#if !defined(S3D_VULKAN)
vec2 FxgiDirectAddress(vec3 sampleRay)
{
	vec3 absolute = abs(sampleRay);
	vec2 uv;
	int face;
	if (absolute.x >= max(absolute.y, absolute.z))
	{
		face = sampleRay.x > 0.0 ? 0 : 1;
		uv = vec2(sampleRay.z * (sampleRay.x > 0.0 ? -1.0 : 1.0), -sampleRay.y);
	}
	else if (absolute.y >= absolute.z)
	{
		face = sampleRay.y > 0.0 ? 2 : 3;
		uv = vec2(sampleRay.x, sampleRay.z * (sampleRay.y > 0.0 ? 1.0 : -1.0));
	}
	else
	{
		face = sampleRay.z > 0.0 ? 4 : 5;
		uv = vec2(sampleRay.x * (sampleRay.z > 0.0 ? 1.0 : -1.0), -sampleRay.y);
	}
	// The centre ray and nearest filtering keep reads inside a face's 3x2 tile.
	return (vec2(face % 3, face / 3) + uv * 0.5 + 0.5) / vec2(3.0, 2.0);
}

float FxgiDirectCompare(int slot, vec3 sampleRay, float receiverDepth,
	float radius, float bias, float worldTexel)
{
	float stored = textureLod(u_fxgiDirectMaps,
		vec3(FxgiDirectAddress(sampleRay), float(slot)), 0.0).r * radius;
	float edge = max(0.002, worldTexel * 0.08);
	return smoothstep(-edge, edge, stored - receiverDepth + bias);
}

float FxgiDirectVisibility(int slot, int lightIndex, vec3 worldPosition,
	vec3 geometricNormal, vec3 lightDirection, float detailWeight)
{
	vec3 fromLight = worldPosition - LightPosition(lightIndex);
	float distance = length(fromLight);
	if (distance < 0.001) return 1.0;
	float resolution = float(textureSize(u_fxgiDirectMaps, 0).x) / 3.0;
	float radius = max(LightParameters(lightIndex).x, 0.001);
	float worldTexel = distance * (2.0 / resolution);
	float grazing = 1.0 - max(dot(geometricNormal, lightDirection), 0.0);
	fromLight += geometricNormal * worldTexel * mix(0.08, 0.24, grazing);
	float currentDepth = length(fromLight);
	float planeDistance = dot(fromLight, geometricNormal);
	float bias = u_shadowBias + worldTexel * mix(0.08, 0.28, grazing);
	if (u_softShadows == 0 || detailWeight <= 0.0)
	{
		vec3 sampleRay = ShadowTexelRay(fromLight, resolution);
		float receiver = ReceiverPlaneDepth(planeDistance, currentDepth, geometricNormal, sampleRay);
		return mix(u_shadowDarkness, 1.0,
			FxgiDirectCompare(slot, sampleRay, receiver, radius, bias, worldTexel));
	}
	vec3 direction = fromLight / max(currentDepth, 0.001);
	vec3 reference = abs(direction.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
	vec3 tangent = normalize(cross(direction, reference));
	vec3 bitangent = cross(direction, tangent);
	float lit = 0.0;
	for (int tap = 0; tap < 4; ++tap)
	{
		vec2 offset = vec2((tap & 1) == 0 ? -1.0 : 1.0, (tap & 2) == 0 ? -1.0 : 1.0);
		vec3 sampleRay = ShadowTexelRay(fromLight + (tangent * offset.x + bitangent * offset.y) *
			worldTexel * 0.55 * detailWeight, resolution);
		float receiver = ReceiverPlaneDepth(planeDistance, currentDepth, geometricNormal, sampleRay);
		lit += FxgiDirectCompare(slot, sampleRay, receiver, radius, bias, worldTexel) * 0.25;
	}
	return mix(u_shadowDarkness, 1.0, lit);
}
#endif

float PointShadowVisibility(int lightIndex, vec3 worldPosition, vec3 geometricNormal,
	vec3 lightDirection, float detailWeight)
{
	int dynamicSlot = LightShadowSlot(lightIndex);
	// A coarse centre-ray visibility map must not clip an existing filtered shadow.
	if (dynamicSlot >= 0 && dynamicSlot < 24)
		return SamplePointShadow(u_shadowMaps, dynamicSlot, ShadowPositionFar(dynamicSlot),
			worldPosition, geometricNormal, lightDirection, detailWeight);
#if !defined(S3D_VULKAN)
	int staticSlot = u_staticShadowSlots[lightIndex];
	if (staticSlot >= 0)
		return SamplePointShadow(u_staticShadowMaps, staticSlot,
			vec4(LightPosition(lightIndex), max(LightParameters(lightIndex).x, 1.0)),
			worldPosition, geometricNormal, lightDirection, detailWeight);
	int bakedSlot = u_fxgiDirectEnabled != 0 ? u_fxgiDirectSlots[lightIndex] : -1;
	if (bakedSlot >= 0)
		return FxgiDirectVisibility(bakedSlot, lightIndex, worldPosition, geometricNormal,
			lightDirection, detailWeight);
#endif
	return 1.0;
}

bool BloodInkEnabled()
{
#if defined(S3D_VULKAN)
	return u_bloodInkEnabled != 0 && (worldChunkIndex < 0 || worldChunks[worldChunkIndex].header.y != 0);
#else
	return u_bloodInkEnabled != 0;
#endif
}

float BloodGrainNoise(vec2 cell)
{
	return fract((cell.x * 0.1031 + cell.y * 0.11369 + 0.731 * 0.13787) *
		(cell.x + cell.y + 19.19));
}

vec2 BloodTexelSlope(vec2 cell)
{
	// Evaluate grain on the texture lattice, so the wet normal does not change
	// as a screen-space derivative quad crosses the edge of a blood pixel.
	return vec2(
		BloodGrainNoise(cell + vec2(1.0, 0.0)) -
			BloodGrainNoise(cell - vec2(1.0, 0.0)),
		BloodGrainNoise(cell + vec2(0.0, 1.0)) -
			BloodGrainNoise(cell - vec2(0.0, 1.0))) * 0.035;
}


float WorldLightingDetail(vec3 lightingPosition)
{
#if defined(S3D_VULKAN)
	return 1.0;
#else
	if (u_lightingLodMode == 0) return 1.0;
	if (u_lightingLodMode == 2) return 0.0;
	return 1.0 - smoothstep(u_lightingLodRange.x, u_lightingLodRange.y,
		length(lightingPosition - u_cameraPosition));
#endif
}

float WorldLightWeight(int rank, float detailWeight)
{
#if !defined(S3D_VULKAN)
	// Reserve the same distant slot for the flashlight in both sides of the fade.
	int distantCount = max(u_distantLightCount - (u_chunkFlashlightIndex >= 0 ? 1 : 0), 0);
	if (rank >= distantCount && rank != u_chunkFlashlightIndex) return detailWeight;
#endif
	return 1.0;
}

float DistantDiffuse(vec3 surfaceNormal, vec3 lightDirection)
{
	return max(dot(surfaceNormal, lightDirection), 0.0) * 0.88;
}

float LocalLightAttenuation(int lightIndex, vec3 worldPosition, vec3 geometricNormal,
	out vec3 lightDirection, out float spot, out float sourceVariance)
{
	lightDirection = vec3(0.0);
	spot = 1.0;
	sourceVariance = 0.0;
	vec4 parameters = LightParameters(lightIndex);
	vec3 toLight = LightPosition(lightIndex) - worldPosition;
	float distanceSquared = dot(toLight, toLight);
	if (parameters.x <= 0.0 || parameters.y <= 0.0 ||
		distanceSquared >= parameters.x * parameters.x) return 0.0;
	// Opaque geometry cannot receive a light lying behind its underlying plane.
	// Reject before cone math, shading, and shadow texture reads.
	if (dot(toLight, geometricNormal) <= 0.0) return 0.0;
	float distanceToLight = sqrt(distanceSquared);
	float inverseDistance = 1.0 / max(distanceToLight, 0.001);
	vec3 falloffData = LightFalloff(lightIndex);
	if (parameters.z > 0.5 && parameters.z < 2.5)
	{
		// Directions and fade widths are prepared once on the CPU. Reject outside
		// the cone before emitting-disc filtering or the material/shadow response.
		float coneWeight = clamp((dot(-toLight, LightDirection(lightIndex)) * inverseDistance -
			parameters.w) * falloffData.y, 0.0, 1.0);
		if (coneWeight <= 0.0) return 0.0;
		spot = coneWeight * coneWeight * (3.0 - 2.0 * coneWeight);
	}
	lightDirection = toLight * inverseDistance;
	if ((u_surfaceFlags & 1) != 0)
		sourceVariance = min(falloffData.z / max(distanceSquared + falloffData.z, 0.000001), 0.2);
	float falloff = 1.0 - distanceToLight * falloffData.x;
	return falloff * falloff * parameters.y;
}

float WorldAmbientOcclusion(float texelBakedAo, vec2 faceUv, int material)
{
	if (u_aoEnabled == 0) return 1.0;
	float bakedAoBand = clamp(texelBakedAo, 0.0, 1.0);
	if (bakedAoFaceSize.x > 0.0 && bakedAoFaceSize.y > 0.0)
	{
		vec2 edgeDistance = min(faceUv, vec2(1.0) - faceUv) * bakedAoFaceSize;
		float contactDistance = min(edgeDistance.x, edgeDistance.y);
		float reach = max(u_aoRadius, 0.05);
		float contactWeight = 1.0 - smoothstep(reach * 0.08, reach, contactDistance);
		bakedAoBand = mix(1.0, bakedAoBand, contactWeight);
	}
	return material == u_emissiveMaterial ? 1.0 :
		pow(max(bakedAoBand, 0.02), max(u_aoStrength, 0.0));
}

bool HasFxgi()
{
#if defined(S3D_VULKAN)
	return false;
#else
	return u_fxgiEnabled != 0 && fxgiChart.z > 0.0 && fxgiChart.w > 0.0;
#endif
}

float FxgiBlend(bool mapped)
{
#if defined(S3D_VULKAN)
	return 0.0;
#else
	return mapped ? clamp(u_fxgiStrength, 0.0, 1.0) : 0.0;
#endif
}

vec4 SampleFxgiAtlas(vec2 faceUv)
{
#if defined(S3D_VULKAN)
	return vec4(0.0);
#else
	if (!HasFxgi()) return vec4(0.0);
	// Texel snapping may extend beyond a trimmed face; stay inside its own chart.
	faceUv = clamp(faceUv, fxgiUvBounds.xy, fxgiUvBounds.zw);
	vec2 atlasUv = fxgiChart.xy + faceUv * fxgiChart.zw;
	// Empty cells have zero alpha. Normalize the filtered sample so hidden
	// portions of trimmed faces cannot darken their remaining visible edges.
	vec4 value = textureLod(u_fxgiAtlas, atlasUv, 0.0);
	value.rgb /= max(value.a, 0.0001);
	return value;
#endif
}

vec3 CombineFxgiDiffuse(vec3 baseColor, vec3 irradiance, vec3 existingColor)
{
	// The legacy pass reads encoded RGBA8 colors. Use a cheap gamma-2
	// approximation to combine its output with the linear baked light.
	vec3 linearBounce = baseColor * baseColor * max(irradiance, vec3(0.0)) * 1.62;
	return sqrt(max(existingColor * existingColor + linearBounce, vec3(0.0)));
}

#if !defined(S3D_VULKAN)
vec3 FxgiDiagnostic(vec4 atlasSample, vec3 baseColor)
{
	if (!HasFxgi()) return vec3(0.08); // Unmapped surface, rather than zero bounce.
	if (atlasSample.a <= 0.0001 || any(isnan(atlasSample)) || any(isinf(atlasSample)))
		return vec3(1.0, 0.0, 1.0); // Chart exists but its texture cannot be read.
	vec3 light = max(atlasSample.rgb, vec3(0.0)) * max(u_fxgiStrength, 0.0);
	if (u_fxgiDebugRawIrradiance == 0) light *= baseColor * baseColor * 1.62;
	light *= clamp(u_fxgiDebugExposure, 1.0, 128.0);
	return sqrt(light / (vec3(1.0) + light));
}
#endif

vec3 DistantAmbient(vec3 geometricNormal, float ambientOcclusion)
{
	float hemisphere = geometricNormal.y * 0.5 + 0.5;
	return (vec3(0.045, 0.052, 0.072) + vec3(0.10, 0.12, 0.17) * hemisphere) *
		ambientOcclusion;
}

bool IsEmissiveImage(int material)
{
	if (material < 0 || material >= 128) return false;
	uint mask = uint(u_emissiveImageMaterials[material >> 5]);
	return (mask & (1u << uint(material & 31))) != 0u;
}

vec4 FinishWorldColor(vec3 color, int material, vec3 materialAlbedo, float fog)
{
	if (material == u_emissiveMaterial || IsEmissiveImage(material))
		color += instanceColor * materialAlbedo * 0.86;
	float peak = max(color.r, max(color.g, color.b));
	if (peak > 0.75 && !u_hdrOutput)
	{
		float excess = peak - 0.75;
		color *= (0.75 + 0.25 * excess / (excess + 0.25)) / peak;
	}
	return vec4(mix(color, u_fogColor, fog), 1.0);
}

#if !defined(S3D_VULKAN)
vec3 DistantWorldColor(vec3 baseColor, vec3 lightingPosition, vec3 geometricNormal,
	float ambientOcclusion, vec3 indirect, bool giMapped, bool projectedUv)
{
	vec3 lighting = (DistantAmbient(geometricNormal, ambientOcclusion) +
		vec3(0.20, 0.18, 0.15) * DistantDiffuse(geometricNormal, -u_sunDirection)) *
		(1.0 - FxgiBlend(giMapped));
	uvec2 lightMasks = WorldLightMasks(lightingPosition, projectedUv);
	while (any(notEqual(lightMasks, uvec2(0u))))
	{
		int rank = PopWorldLight(lightMasks);
		if (WorldLightWeight(rank, 0.0) <= 0.0) continue;
		int index = ChunkLightIndex(rank);
		vec3 direction;
		float spot, sourceVariance;
		float attenuation = LocalLightAttenuation(index, lightingPosition, geometricNormal, direction, spot, sourceVariance);
		if (attenuation <= 0.0 || spot <= 0.0) continue;
		float diffuseResponse = DistantDiffuse(geometricNormal, direction);
		// A light behind this face cannot contribute diffuse light in the distant path.
		if (diffuseResponse <= 0.0) continue;
		attenuation *= PointShadowVisibility(index, lightingPosition, geometricNormal, direction, 0.0);
		attenuation *= spot;
		lighting += LightColor(index) * attenuation * diffuseResponse * 0.92;
	}
	vec3 color = baseColor * lighting * 1.62;
	return giMapped ? CombineFxgiDiffuse(baseColor,
		indirect * mix(0.85, 1.0, ambientOcclusion), color) : color;
}
#endif

bool IsStructuralMaterial(int material)
{
	if (material < 0 || material >= 128) return false;
	uint mask = uint(u_structuralMaterials[material >> 5]);
	return (mask & (1u << uint(material & 31))) != 0u;
}

void main()
{
	// Models use -(layer + 1); disks reserve -513-layer for shell tinting.
	bool tintedDisk = materialIndex <= -513;
	bool authoredUv = materialIndex < 0;
	bool metricDoor = materialIndex >= 256;
	int material = tintedDisk ? -materialIndex - 513 :
		(authoredUv ? -materialIndex - 1 : (metricDoor ? materialIndex - 256 : materialIndex));
	vec3 geometricNormal = normalize(normal);
	vec3 absoluteNormal = abs(geometricNormal);
	vec2 surface = absoluteNormal.y > max(absoluteNormal.x, absoluteNormal.z) ?
		texturePosition.xz : (absoluteNormal.x > absoluteNormal.z ? texturePosition.zy : texturePosition.xy);
	const float structuralTextureScale = 0.125;
	bool structural = material == u_floorMaterial || material == u_wallMaterial ||
		material == u_ceilingMaterial || material == u_panelMaterial || IsStructuralMaterial(material);
	metricDoor = metricDoor || material == u_doorLeftMaterial || material == u_doorRightMaterial;
	float textureScale = metricDoor ? .5 : (structural ? structuralTextureScale : 0.24);
	bool fixedImage = authoredUv ||
		(material >= u_fixedPuzzleFirstMaterial &&
		material <= u_fixedPuzzleLastMaterial);
	vec2 materialUv = fixedImage ? clamp(boxUv, vec2(0.004), vec2(0.996)) :
		surface * textureScale;
	// Every lighting term uses this same authored texel centre. Keep the original
	// UV derivatives for texture LOD and tangent frames; snapped UVs have discontinuities.
	vec2 materialTextureSize = vec2(textureSize(u_albedoMaps, 0).xy);
	vec2 texelScreenOffset = S3DTexelScreenOffset(materialUv, materialTextureSize);
	vec2 sampleUv = S3DTexelCenter(materialUv, materialTextureSize);
	vec2 uvDx = dFdx(materialUv);
	vec2 uvDy = dFdy(materialUv);
	// Evaluate derivatives before any per-pixel fog exit.
	vec3 positionDx = dFdx(position);
	vec3 positionDy = S3D_DFDY(position);
	vec2 tangentUv = fixedImage ? boxUv : materialUv;
	vec2 tangentUvDx = dFdx(tangentUv);
	vec2 tangentUvDy = S3D_DFDY(tangentUv);
	vec3 lightingPosition = S3DTexelValue(position, texelScreenOffset);
	geometricNormal = normalize(S3DTexelValue(normal, texelScreenOffset));
	vec2 faceUv = clamp(S3DTexelValue(boxUv, texelScreenOffset), vec2(0.0), vec2(1.0));
	float texelBakedAo = S3DTexelValue(bakedAmbientOcclusion, texelScreenOffset);
	float fog = smoothstep(u_fogNear, u_fogFar, length(position - u_cameraPosition));
	bool diagnosticView = false;
#if !defined(S3D_VULKAN)
	diagnosticView = u_fxgiEnabled != 0 && u_fxgiIndirectOnly != 0;
#endif
	if (u_fullbright == 0 && !diagnosticView && fog >= 1.0)
	{
		FragColor = vec4(u_fogColor, 1.0);
		return;
	}
	// Fixture lenses and small indicators are solid color; puzzle screens retain their images.
	vec3 materialAlbedo = material == u_emissiveMaterial ? vec3(1.0) :
		textureGrad(u_albedoMaps, vec3(sampleUv, float(material)), uvDx, uvDy).rgb;
	vec3 surfaceTint = material == u_emissiveMaterial ? instanceColor :
		mix(vec3(1.0), instanceColor, 0.42);
	if (tintedDisk)
	{
		// The paper label and metal shutter retain their neutral artwork; only
		// the ABS shell receives the required disk colour. No extra texture fetch.
		float label = step(.08, boxUv.x) * step(boxUv.x, .92) * step(.035, boxUv.y) * step(boxUv.y, .56);
		float shutter = step(.20, boxUv.x) * step(boxUv.x, .81) * step(.64, boxUv.y);
		surfaceTint = mix(max(instanceColor, vec3(.025)), vec3(1.0), max(label, shutter));
	}
	vec3 baseColor = surfaceTint * materialAlbedo;
	float bloodMask = BloodInkEnabled() ? WorldBloodMask(lightingPosition, geometricNormal) : 0.0;
	baseColor = mix(baseColor, BLOOD_BASE_COLOR, bloodMask);
	if (u_fullbright != 0)
	{
		FragColor = vec4(baseColor, 1.0);
		return;
	}
	// Unlit fixtures and advertising screens skip surface-lighting work.
#if !defined(S3D_VULKAN)
	if ((material == u_emissiveMaterial || IsEmissiveImage(material)) &&
		!(u_fxgiEnabled != 0 && u_fxgiIndirectOnly != 0))
#else
	if (material == u_emissiveMaterial || IsEmissiveImage(material))
#endif
	{
		FragColor = FinishWorldColor(vec3(0.0), material, materialAlbedo, fog);
		return;
	}
	float ambientOcclusion = WorldAmbientOcclusion(texelBakedAo, faceUv, material);
	vec4 giSample = SampleFxgiAtlas(faceUv);
	bool giMapped = HasFxgi() && giSample.a > 0.0001;
	float giBlend = FxgiBlend(giMapped);
	vec3 indirect = vec3(0.0);
#if !defined(S3D_VULKAN)
	if (giMapped) indirect = giSample.rgb * max(u_fxgiStrength, 0.0);
#endif
#if !defined(S3D_VULKAN)
	if (u_fxgiEnabled != 0 && u_fxgiIndirectOnly != 0)
	{
		FragColor = vec4(FxgiDiagnostic(giSample, baseColor), 1.0);
		return;
	}
#endif
#if !defined(S3D_VULKAN)
	// This draw-wide branch keeps all derivative operations uniform while
	// distant chunks skip normal maps, surface maps and the detailed BRDF.
	if (u_lightingLodMode == 2 && (u_surfaceFlags & 4) == 0)
	{
		FragColor = FinishWorldColor(DistantWorldColor(baseColor, lightingPosition,
			geometricNormal, ambientOcclusion, indirect, giMapped, !fixedImage), material, materialAlbedo, fog);
		return;
	}
#endif
	float detailWeight = WorldLightingDetail(lightingPosition);
	vec4 normalSample = textureGrad(u_normalMaps, vec3(sampleUv, float(material)), uvDx, uvDy);
	vec3 mappedNormal = normalSample.xyz * 2.0 - 1.0;
	vec4 surfaceProperties = textureGrad(u_surfaceMaps,
		vec3(sampleUv, float(material)), uvDx, uvDy);
	float specularLevel = surfaceProperties.r;
	float smoothness = surfaceProperties.g;
	float metallic = surfaceProperties.b * detailWeight;
	float anisotropy = surfaceProperties.a;
	// Mip alpha retains normal dispersion instead of discarding it during
	// renormalization. Fold unresolved slopes into roughness to stabilize glints.
	float normalVariance = max(1.0 - normalSample.a, 0.0) * min(u_normalStrength * u_normalStrength, 4.0);
	smoothness = 1.0 - sqrt(clamp((1.0 - smoothness) * (1.0 - smoothness) + normalVariance * 0.4, 0.001225, 0.9216));
	mappedNormal.y = -mappedNormal.y;
	mappedNormal.xy *= u_normalStrength;
	mappedNormal = normalize(mappedNormal);
	mat3 surfaceFrame = CotangentFrame(geometricNormal, positionDx, positionDy, tangentUvDx, tangentUvDy);
	vec3 mappedWorldNormal = normalize(surfaceFrame * mappedNormal);
	vec3 N = mappedWorldNormal;
	float reflectionStrength = u_specularStrength * detailWeight;
	// Only stained pixels need wet-normal work. Grain shares the albedo grid.
	if (bloodMask > 0.0)
	{
		vec2 bloodSlope = BloodTexelSlope(floor(materialUv * materialTextureSize));
		vec3 bloodMappedNormal = normalize(vec3(-bloodSlope, 1.0));
		vec3 bloodWorldNormal = normalize(surfaceFrame * bloodMappedNormal);
		N = normalize(mix(N, bloodWorldNormal, bloodMask));
		specularLevel = mix(specularLevel, BLOOD_SPECULAR_LEVEL, bloodMask);
		smoothness = mix(smoothness, BLOOD_SMOOTHNESS, bloodMask);
		metallic *= 1.0 - bloodMask;
		anisotropy *= 1.0 - bloodMask;
		reflectionStrength *= mix(1.0, BLOOD_REFLECTION_GAIN, bloodMask);
	}
	vec3 viewDirection = normalize(u_cameraPosition - lightingPosition);
	N = SurfaceViewNormal(geometricNormal, N, viewDirection);
	float normalView = max(dot(N, viewDirection), 0.0);
	if ((u_surfaceFlags & 4) != 0)
	{
		FragColor = vec4(dot(N, viewDirection) <= 0.0 ? vec3(1.0, 0.02, 0.01) : N * 0.5 + 0.5, 1.0);
		return;
	}
	bool facetRelay = (u_surfaceFlags & 1) != 0;
	float reflectance = SpecularReflectance(specularLevel);
	vec3 reflectanceColor = mix(vec3(0.018 + 0.062 * specularLevel),
		clamp(baseColor, vec3(0.08), vec3(0.9)), metallic);
	vec3 diffuseColor = baseColor * (1.0 - metallic);
	float roughness = facetRelay ? FacetRelayRoughness(smoothness) : SurfaceRoughness(smoothness);
	vec3 fastResponse = vec3(0.0), detailedResponse = vec3(0.0), diffuseParameters = vec3(0.0);
	if (!facetRelay)
	{
		fastResponse = u_fastSpecular != 0 ? FastReflectionParameters(specularLevel, smoothness) : vec3(0.0);
		detailedResponse = u_fastSpecular == 0 ? BeckmannParameters(specularLevel, smoothness) : vec3(0.0);
		diffuseParameters = RelayDiffuseParameters(roughness, reflectance, reflectionStrength);
	}
	vec3 tangentValue = vec3(0.0), bitangentValue = vec3(0.0);
	float viewMask = 1.0;
	if (u_fastSpecular == 0 && reflectionStrength > 0.0)
	{
		mat3 specularFrame = SurfaceSpecularFrame(N, surfaceFrame[0]);
		tangentValue = specularFrame[0];
		bitangentValue = specularFrame[1];
		if (!facetRelay)
			viewMask += BeckmannLambda(viewDirection, tangentValue, bitangentValue, detailedResponse, normalView);
	}
	// PrepareFacetRelay initializes every field before either guarded use below.
	// Keep this declaration independent of the include's internal field count.
	FacetRelayParameters facetParameters;
	if (facetRelay)
		facetParameters = PrepareFacetRelay(geometricNormal, N, viewDirection, roughness,
			reflectanceColor, reflectionStrength, u_fastSpecular == 0, anisotropy);
	float hemisphere = N.y * 0.5 + 0.5;

	float normalCavity = material == u_emissiveMaterial ? 1.0 :
		mix(0.72, 1.0, smoothstep(0.35, 0.98, mappedNormal.z));
	vec3 ambientField = (vec3(0.045, 0.052, 0.072) +
		vec3(0.10, 0.12, 0.17) * hemisphere) * ambientOcclusion * normalCavity;

	ambientField = mix(DistantAmbient(geometricNormal, ambientOcclusion), ambientField, detailWeight);
	ambientField *= 1.0 - giBlend;

	// Computed GI replaces this legacy fill; skip its response when fully faded.
	vec3 sunColor = vec3(0.20, 0.18, 0.15) * (1.0 - giBlend);
	vec3 directDiffuse = vec3(0.0), directReflection = vec3(0.0);
	if (giBlend < 1.0)
	{
		vec3 sunDirection = -u_sunDirection;
		float sunDiffuse;
		if (facetRelay)
		{
			vec4 response = EvaluateFacetRelay(geometricNormal, N, tangentValue,
				viewDirection, sunDirection, 0.0001, facetParameters);
			sunDiffuse = mix(DistantDiffuse(geometricNormal, sunDirection), response.x, detailWeight);
			directReflection = sunColor * response.yzw;
		}
		else
		{
			sunDiffuse = mix(DistantDiffuse(geometricNormal, sunDirection),
				RelayDiffuse(N, viewDirection, sunDirection, diffuseParameters, normalView), detailWeight);
			directReflection = SurfaceReflection(sunColor, N, tangentValue,
				bitangentValue, viewDirection, sunDirection, reflectionStrength,
				fastResponse, detailedResponse, normalView, viewMask);
		}
		directDiffuse = diffuseColor * sunColor * sunDiffuse;
	}
	vec3 reflectionDirection = reflect(-viewDirection, N);
	float reflectedSky = reflectionDirection.y * 0.5 + 0.5;
	vec3 environmentField = mix(u_fogColor * 0.55,
		vec3(0.30, 0.39, 0.52), reflectedSky);
	environmentField *= mix(ambientOcclusion, 1.0, 0.44);

	uvec2 lightMasks = WorldLightMasks(lightingPosition, !fixedImage);
	while (any(notEqual(lightMasks, uvec2(0u))))
	{
		int rank = PopWorldLight(lightMasks);
		float lightWeight = WorldLightWeight(rank, detailWeight);
		if (lightWeight <= 0.0) continue;
		int lightIndex = ChunkLightIndex(rank);
		vec3 localLightDirection;
		float spot, sourceVariance;
		float attenuation = LocalLightAttenuation(lightIndex, lightingPosition, geometricNormal,
			localLightDirection, spot, sourceVariance);
		if (attenuation <= 0.0 || spot <= 0.0) continue;
		float diffuseResponse;
		vec3 facetSpecular = vec3(0.0);
		if (facetRelay)
		{
			vec4 response = EvaluateFacetRelay(geometricNormal, N, tangentValue,
				viewDirection, localLightDirection, sourceVariance, facetParameters);
			diffuseResponse = mix(DistantDiffuse(geometricNormal, localLightDirection), response.x, detailWeight);
			facetSpecular = response.yzw;
		}
		else
			diffuseResponse = mix(DistantDiffuse(geometricNormal, localLightDirection),
				RelayDiffuse(N, viewDirection, localLightDirection, diffuseParameters, normalView), detailWeight);
		// Skip shadow reads when neither component can receive this light.
		if (diffuseResponse <= 0.0 && (facetRelay ? all(lessThanEqual(facetSpecular, vec3(0.0))) :
			(reflectionStrength <= 0.0 || normalView <= 0.0 || dot(N, localLightDirection) <= 0.0))) continue;
		attenuation *= PointShadowVisibility(lightIndex, lightingPosition, geometricNormal,
			localLightDirection, detailWeight);
		if (attenuation <= 0.0) continue;
		attenuation *= spot;
		attenuation *= lightWeight;
		vec3 lightColor = LightColor(lightIndex);
		directDiffuse += diffuseColor * lightColor * attenuation * diffuseResponse * 0.92;
		if (detailWeight > 0.0)
		{
			if (facetRelay) directReflection += lightColor * attenuation * facetSpecular;
			else directReflection += SurfaceReflection(lightColor * attenuation, N, tangentValue,
				bitangentValue, viewDirection, localLightDirection, reflectionStrength,
				fastResponse, detailedResponse, normalView, viewMask);
		}
	}

	vec3 environmentReflection = facetRelay ? FacetRelayEnvironment(environmentField,
		normalView, reflectanceColor, roughness, reflectionStrength) : EnvironmentReflection(environmentField,
		normalView, reflectance, smoothness, reflectionStrength);
	vec3 reflectedLight = facetRelay ? CompressFacetRelayReflection(directReflection + environmentReflection) :
		CompressSurfaceReflection(directReflection + environmentReflection);
	vec3 color = diffuseColor * ambientField * 1.62 + directDiffuse * 1.62 + reflectedLight;
	if (giMapped) color = CombineFxgiDiffuse(baseColor,
		indirect * (1.0 - metallic) * mix(0.85, 1.0, ambientOcclusion) * mix(1.0, normalCavity, detailWeight), color);
	FragColor = FinishWorldColor(color, material, materialAlbedo, fog);
}
