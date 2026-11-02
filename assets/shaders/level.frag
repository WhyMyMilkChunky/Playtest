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
#define u_hdrOutput (worldFrame.fxgiDebug.w > 0.5)
#else
uniform bool u_hdrOutput;
#endif

#if defined(S3D_VULKAN)
#include "include/game_world_gpu.glsl"
// -1 keeps the uniform-driven fallback. Specialized pipelines fix the chosen
// response model (bit 1), detailed specular (bit 0), and static chunk input (bit 2).
layout(constant_id = 0) const int s3dWorldResponseMode = -1;
layout(location = 0) in vec3 position;
layout(location = 1) in vec3 normal;
layout(location = 2) in vec3 instanceColor;
layout(location = 3) in vec2 boxUv;
layout(location = 4) flat in int materialIndex;
layout(location = 5) in float bakedAmbientOcclusion;
layout(location = 6) flat in vec2 bakedAoFaceSize;
layout(location = 7) flat in int worldChunkIndex;
layout(location = 8) in vec3 texturePosition;
layout(location = 9) flat in vec4 fxgiChart;
layout(location = 10) flat in vec4 fxgiUvBounds;
layout(location = 11) flat in int lightingLodMode;
layout(location = 12) flat in vec4 fxgiRadianceRed;
layout(location = 13) flat in vec4 fxgiRadianceGreen;
layout(location = 14) flat in vec4 fxgiRadianceBlue;
layout(location = 15) flat in vec4 bloodSurface;
S3D_RESOURCE(2, 6) uniform sampler2D u_fxgiAtlas;
S3D_RESOURCE(2, 9) uniform sampler2DArray u_fxgiDirectMaps;
S3D_RESOURCE(2, 8) uniform samplerBuffer u_spatialLightGrid;
S3D_RESOURCE(0, 3) layout(std430) readonly buffer S3DWorldLightBuffer { S3DWorldLight worldLightTable[]; };

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
#define u_doorLeftMaterial worldFrame.materialIds1.x
#define u_doorRightMaterial worldFrame.materialIds1.y
#define u_fixedPuzzleFirstMaterial worldFrame.materialIds1.z
#define u_fixedPuzzleLastMaterial worldFrame.materialIds1.w
#define u_emissiveMaterial worldFrame.counts.x
#define u_shadowBias worldFrame.shadowSettings.x
#define u_shadowDarkness worldFrame.shadowSettings.y
#define u_softShadows int(worldFrame.shadowSettings.z)
#define u_fastSpecular                                                                                       \
	(s3dWorldResponseMode < 0 ? int(worldFrame.shadowSettings.w) : ((s3dWorldResponseMode & 1) == 0 ? 1 : 0))
#define u_surfaceFlags worldFrame.counts.z
#define u_fxgiEnabled int(worldFrame.fxgiSettings.x)
#define u_fxgiStrength worldFrame.fxgiSettings.y
#define u_fxgiOnly int(worldFrame.fxgiSettings.z)
#define u_fxgiBlockerCount int(worldFrame.fxgiDebug.y)
#define u_fxgiDirectEnabled int(worldFrame.fxgiDebug.z)
#define u_lightingLodMode lightingLodMode
#define u_lightingLodRange worldFrame.lightingLod.xy
#define u_distantLightCount int(worldFrame.lightingLod.z)
#define u_chunkFlashlightIndex (WorldHasChunk() ? worldChunks[worldChunkIndex].header.z : worldFrame.counts.w)
#define u_chunkGridOffset (WorldHasChunk() ? worldChunks[worldChunkIndex].gridHeader.x : -1)
#define u_chunkGridMinimum worldChunks[worldChunkIndex].gridMinimum.xyz
#define u_chunkGridScale worldChunks[worldChunkIndex].gridScale.xyz
#define u_chunkGridSelectedMask worldChunks[worldChunkIndex].gridHeader.y
#define u_chunkGridUncachedMask worldChunks[worldChunkIndex].gridHeader.z
#define u_livingEye worldFrame.livingEye.xy
#define u_powerOutage int(worldFrame.livingEye.z)
#define u_redAlert int(worldFrame.livingEye.w)
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
flat in vec4 fxgiRadianceRed;
flat in vec4 fxgiRadianceGreen;
flat in vec4 fxgiRadianceBlue;
flat in vec4 bloodSurface;
uniform int u_fxgiEnabled;
uniform int u_fxgiOnly;
uniform float u_fxgiStrength;
uniform int u_fxgiBlockerCount;
uniform int u_fxgiBlockerMasks0[24];
uniform int u_fxgiBlockerMasks1[24];
uniform int u_fxgiBlockerIncomplete[24];
layout(std140, binding = 13) uniform FxgiMovingBlockerFrame { mat4 fxgiMovingBlockers[64]; };
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
uniform int u_structuralMaterials[8];
uniform int u_emissiveImageMaterials[8];
uniform int u_doorLeftMaterial;
uniform int u_doorRightMaterial;
uniform int u_fixedPuzzleFirstMaterial;
uniform int u_fixedPuzzleLastMaterial;
uniform int u_emissiveMaterial;
uniform int u_fullbright;
uniform int u_powerOutage;
uniform int u_redAlert;
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
uniform int u_bloodInkEnabled;
// Static 8x8x8 cells contain seven exact 24-bit masks: general and six axis facings.
// The CPU remaps those bits to the current ranked light packet once per chunk.
layout(binding = 8) uniform samplerBuffer u_spatialLightGrid;
uniform int u_chunkGridOffset;
uniform vec3 u_chunkGridMinimum;
uniform vec3 u_chunkGridScale;
uniform int u_chunkGridSelectedMask;
uniform int u_chunkGridUncachedMask;
uniform int u_chunkGridLightSlots[24];
uniform vec2 u_livingEye;
#endif

S3D_RESOURCE(1, 0) uniform sampler2DArray u_albedoMaps;
S3D_RESOURCE(1, 1) uniform sampler2DArray u_normalMaps;
S3D_RESOURCE(1, 2) uniform sampler2DArray u_surfaceMaps;
S3D_RESOURCE(2, 4) uniform samplerCubeArray u_shadowMaps;
S3D_RESOURCE(2, 5) uniform samplerCubeArray u_staticShadowMaps;
S3D_RESOURCE(2, 10) uniform sampler2D u_eyeState0;
S3D_RESOURCE(2, 11) uniform sampler2D u_eyeState1;

#include "include/game_living_eye.glsl"

#if defined(S3D_VULKAN)
bool WorldHasChunk()
{
	return (s3dWorldResponseMode >= 0 && (s3dWorldResponseMode & 4) != 0) || worldChunkIndex >= 0;
}
#endif

bool WorldFacetRelay()
{
#if defined(S3D_VULKAN)
	if (s3dWorldResponseMode >= 0) return (s3dWorldResponseMode & 2) != 0;
#endif
	return (u_surfaceFlags & 1) != 0;
}

int ChunkLightCount()
{
#if defined(S3D_VULKAN)
	return WorldHasChunk() ? worldChunks[worldChunkIndex].header.x : worldFrame.counts.y;
#else
	return u_chunkLightCount;
#endif
}

int ChunkLightIndex(int index)
{
#if defined(S3D_VULKAN)
	if (!WorldHasChunk()) return index;
	ivec4 packed = worldChunks[worldChunkIndex].lightIndices[index / 4];
	return packed[index & 3];
#else
	return u_chunkLightIndices[index];
#endif
}

uvec2 WorldLightMasks(vec3 lightingPosition, vec3 geometricNormal, bool projectedUv)
{
	if (u_chunkGridOffset >= 0 && projectedUv)
	{
		vec3 gridPosition = (lightingPosition - u_chunkGridMinimum) * u_chunkGridScale;
		// Matches SurfaceLightCache::GridSide; footprint padding remains unchanged.
		ivec3 cell = ivec3(clamp(floor(gridPosition), vec3(0.0), vec3(7.0)));
		// Only exactly axis-aligned normals may use a facing mask. Slopes,
		// bevels, and rotated surfaces keep the original general candidate set.
		int facing = 0;
		if (geometricNormal.y == 0.0 && geometricNormal.z == 0.0)
			facing = geometricNormal.x > 0.0 ? 1 : 2;
		else if (geometricNormal.x == 0.0 && geometricNormal.z == 0.0)
			facing = geometricNormal.y > 0.0 ? 3 : 4;
		else if (geometricNormal.x == 0.0 && geometricNormal.y == 0.0)
			facing = geometricNormal.z > 0.0 ? 5 : 6;
		int address = u_chunkGridOffset + (cell.x + cell.y * 8 + cell.z * 64) * 7 + facing;
		uint cached = uint(texelFetch(u_spatialLightGrid, address).r);
		return uvec2(cached & uint(u_chunkGridSelectedMask), uint(u_chunkGridUncachedMask));
	}
	return uvec2(0u, (1u << uint(ChunkLightCount())) - 1u);
}

int PopWorldLight(inout uvec2 masks)
{
	if (masks.x != 0u)
	{
		int cachedSlot = findLSB(masks.x);
		masks.x &= masks.x - 1u;
#if defined(S3D_VULKAN)
		return worldChunks[worldChunkIndex].gridLightSlots[cachedSlot / 4][cachedSlot & 3];
#else
		return u_chunkGridLightSlots[cachedSlot];
#endif
	}
	int rank = findLSB(masks.y);
	masks.y &= masks.y - 1u;
	return rank;
}

#if defined(S3D_VULKAN)
S3DWorldLight WorldLight(int index)
{
	return WorldHasChunk() ? worldLightTable[index] : worldFrame.lights[index];
}
#endif

vec3 LightPosition(int index)
{
#if defined(S3D_VULKAN)
	return WorldLight(index).position.xyz;
#else
	return u_lightPositions[index];
#endif
}

vec3 LightFalloff(int index)
{
#if defined(S3D_VULKAN)
	S3DWorldLight light = WorldLight(index);
	return vec3(light.color.w, light.direction.w, light.position.w);
#else
	return u_lightFalloffs[index];
#endif
}

vec3 LightColor(int index)
{
#if defined(S3D_VULKAN)
	return WorldLight(index).color.xyz;
#else
	return u_lightColors[index];
#endif
}

vec3 LightDirection(int index)
{
#if defined(S3D_VULKAN)
	return WorldLight(index).direction.xyz;
#else
	return u_lightDirections[index];
#endif
}

vec4 LightParameters(int index)
{
#if defined(S3D_VULKAN)
	return WorldLight(index).parameters;
#else
	return u_lightParameters[index];
#endif
}

int LightShadowSlot(int index)
{
#if defined(S3D_VULKAN)
	return WorldLight(index).shadow.x;
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

vec3 SurfaceReflection(vec3 lightColor, vec3 normalValue, vec3 tangentValue, vec3 bitangentValue,
    vec3 viewDirection, vec3 lightDirection, float strength, vec3 fastResponse, vec3 detailedResponse,
    float normalView, float viewMask)
{
	if (strength <= 0.0 || all(lessThanEqual(lightColor, vec3(0.0)))) return vec3(0.0);
	if (u_fastSpecular != 0)
		return FastSurfaceReflection(
		    lightColor, normalValue, viewDirection, lightDirection, fastResponse, strength);
	return BeckmannReflection(lightColor, normalValue, tangentValue, bitangentValue, viewDirection,
	    lightDirection, detailedResponse, normalView, viewMask, strength);
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

float ReceiverPlaneDepth(float planeDistance, float fallbackDistance, vec3 geometricNormal, vec3 sampleRay)
{
	float denominator = dot(normalize(sampleRay), geometricNormal);
	// grazing rays make this division go to hell; center depth is safer than a huge shadow streak.
	if (abs(denominator) < 0.005) return fallbackDistance;
	float depth = planeDistance / denominator;
	return depth > 0.0 ? depth : fallbackDistance;
}

float ShadowCompare(samplerCubeArray shadowMap, int slot, vec3 sampleDirection, float receiverDepth,
    float farPlane, float bias, float worldTexel)
{
	float storedDepth = textureLod(shadowMap, vec4(sampleDirection, float(slot)), 0.0).r * farPlane;
	// A small continuous transition also softens nearest-depth texel boundaries.
	return smoothstep(-worldTexel * 0.08, worldTexel * 0.08, storedDepth - receiverDepth + bias);
}

vec3 ShadowFilterOrigin(vec3 ray, float resolution, out vec2 blend, out int axis)
{
	vec3 absolute = abs(ray);
	axis = absolute.x >= max(absolute.y, absolute.z) ? 0 : (absolute.y >= absolute.z ? 1 : 2);
	ray /= max(max(absolute.x, absolute.y), absolute.z);
	vec2 uv = axis == 0 ? ray.yz : (axis == 1 ? ray.xz : ray.xy);
	vec2 coordinate = (uv * 0.5 + 0.5) * resolution - 0.5;
	blend = fract(coordinate);
	vec2 centre = (floor(coordinate) + 0.5) * (2.0 / resolution) - 1.0;
	return axis == 0 ? vec3(sign(ray.x), centre)
	                 : (axis == 1 ? vec3(centre.x, sign(ray.y), centre.y) : vec3(centre, sign(ray.z)));
}

vec3 ShadowFilterDirection(vec3 origin, int axis, int tap, float resolution)
{
	vec2 offset = vec2(tap & 1, tap >> 1) * (2.0 / resolution);
	vec3 ray = origin + (axis == 0 ? vec3(0.0, offset)
	                               : (axis == 1 ? vec3(offset.x, 0.0, offset.y) : vec3(offset, 0.0)));
	// taps can cross a cube seam; select the neighbouring face before looking up its centre ray.
	return ShadowTexelRay(ray, resolution);
}

float ShadowFilterWeight(int tap, vec2 blend)
{
	return ((tap & 1) == 0 ? 1.0 - blend.x : blend.x) * ((tap & 2) == 0 ? 1.0 - blend.y : blend.y);
}

float SamplePointShadow(samplerCubeArray shadowMap, int slot, vec4 lightPositionFar, vec3 worldPosition,
    vec3 geometricNormal, vec3 lightDirection, float detailWeight)
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
		return mix(u_shadowDarkness, 1.0,
		    ShadowCompare(shadowMap, slot, sampleRay, depth, lightPositionFar.w, bias, worldTexel));
	}
	vec2 blend;
	int axis;
	vec3 filterOrigin = ShadowFilterOrigin(fromLight, resolution, blend, axis);
	blend = mix(step(vec2(0.5), blend), blend, detailWeight);
	float lit = 0.0;
	for (int tap = 0; tap < 4; ++tap)
	{
		vec3 sampleDirection = ShadowFilterDirection(filterOrigin, axis, tap, resolution);
		float receiverDepth =
		    ReceiverPlaneDepth(planeDistance, currentDepth, geometricNormal, sampleDirection);
		lit += ShadowCompare(
		           shadowMap, slot, sampleDirection, receiverDepth, lightPositionFar.w, bias, worldTexel) *
		       ShadowFilterWeight(tap, blend);
	}
	return mix(u_shadowDarkness, 1.0, lit);
}

int FxgiDirectSlot(int index)
{
#if defined(S3D_VULKAN)
	return WorldLight(index).shadow.y;
#else
	return u_fxgiDirectSlots[index];
#endif
}

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

float FxgiDirectCompare(
    int slot, vec3 sampleRay, float receiverDepth, float radius, float bias, float worldTexel)
{
	float stored =
	    textureLod(u_fxgiDirectMaps, vec3(FxgiDirectAddress(sampleRay), float(slot)), 0.0).r * radius;
	float edge = max(0.002, worldTexel * 0.08);
	return smoothstep(-edge, edge, stored - receiverDepth + bias);
}

float FxgiDirectVisibility(int slot, int lightIndex, vec3 worldPosition, vec3 geometricNormal,
    vec3 lightDirection, float detailWeight)
{
	vec3 fromLight = worldPosition - LightPosition(lightIndex);
	float distance = length(fromLight);
	if (distance < 0.001) return 1.0;
	float resolution = float(textureSize(u_fxgiDirectMaps, 0).x) / 3.0;
	float radius = max(LightParameters(lightIndex).x, 0.001);
	float worldTexel = distance * (2.0 / resolution);
	float grazing = 1.0 - max(dot(geometricNormal, lightDirection), 0.0);
	fromLight += geometricNormal * min(worldTexel * mix(0.08, 0.24, grazing), 0.04);
	float currentDepth = length(fromLight);
	float planeDistance = dot(fromLight, geometricNormal);
	float bias = min(max(u_shadowBias, 0.0) + worldTexel * mix(0.08, 0.28, grazing), 0.06);
	if (u_softShadows == 0 || detailWeight <= 0.0)
	{
		vec3 sampleRay = ShadowTexelRay(fromLight, resolution);
		float receiver = ReceiverPlaneDepth(planeDistance, currentDepth, geometricNormal, sampleRay);
		return FxgiDirectCompare(slot, sampleRay, receiver, radius, bias, worldTexel);
	}
	vec2 blend;
	int axis;
	vec3 filterOrigin = ShadowFilterOrigin(fromLight, resolution, blend, axis);
	blend = mix(step(vec2(0.5), blend), blend, detailWeight);
	float lit = 0.0;
	for (int tap = 0; tap < 4; ++tap)
	{
		vec3 sampleRay = ShadowFilterDirection(filterOrigin, axis, tap, resolution);
		float receiver = ReceiverPlaneDepth(planeDistance, currentDepth, geometricNormal, sampleRay);
		lit += FxgiDirectCompare(slot, sampleRay, receiver, radius, bias, worldTexel) *
		       ShadowFilterWeight(tap, blend);
	}
	return lit;
}

bool FxgiOnlyView() { return u_fxgiEnabled != 0 && u_fxgiOnly != 0; }

bool FxgiSegmentBlocked(mat4 inverseBox, vec3 from, vec3 to)
{
	vec3 origin = (inverseBox * vec4(from, 1.0)).xyz;
	vec3 direction = mat3(inverseBox) * (to - from);
	bvec3 parallel = lessThan(abs(direction), vec3(0.0000001));
	if (any(bvec3(parallel.x && abs(origin.x) > 0.5, parallel.y && abs(origin.y) > 0.5,
	        parallel.z && abs(origin.z) > 0.5)))
		return false;
	vec3 safeDirection = mix(direction, vec3(1.0), parallel);
	vec3 first = (-vec3(0.5) - origin) / safeDirection;
	vec3 last = (vec3(0.5) - origin) / safeDirection;
	vec3 lo = mix(min(first, last), vec3(-1e20), parallel);
	vec3 hi = mix(max(first, last), vec3(1e20), parallel);
	float entry = max(max(lo.x, lo.y), max(lo.z, 0.00001));
	float exit = min(min(hi.x, hi.y), min(hi.z, 0.99999));
	return entry <= exit;
}

float FxgiMovingVisibility(int light, vec3 position, vec3 normalValue)
{
	if (u_fxgiDirectEnabled == 0) return 1.0;
#if defined(S3D_VULKAN)
	uvec4 mask = WorldLight(light).movingMask;
#else
	uvec4 mask = uvec4(uint(u_fxgiBlockerMasks0[light]), uint(u_fxgiBlockerMasks1[light]),
	    uint(u_fxgiBlockerIncomplete[light]), 0u);
#endif
	if (mask.z != 0u) return 0.0;
	vec3 origin = position + normalValue * 0.006;
	for (int word = 0; word < 2; ++word)
	{
		uint bits = mask[word];
		while (bits != 0u)
		{
			int index = findLSB(bits) + word * 32;
			bits &= bits - 1u;
			if (index >= u_fxgiBlockerCount) return 0.0;
#if defined(S3D_VULKAN)
			mat4 inverseBox = worldFrame.movingBlockers[index];
#else
			mat4 inverseBox = fxgiMovingBlockers[index];
#endif
			if (FxgiSegmentBlocked(inverseBox, origin, LightPosition(light))) return 0.0;
		}
	}
	return 1.0;
}

float PointShadowVisibility(
    int lightIndex, vec3 worldPosition, vec3 geometricNormal, vec3 lightDirection, float detailWeight)
{
	float moving = FxgiMovingVisibility(lightIndex, worldPosition, geometricNormal);
	if (moving <= 0.0) return 0.0;
	int bakedSlot = u_fxgiDirectEnabled != 0 ? FxgiDirectSlot(lightIndex) : -1;
	if (FxgiOnlyView())
		return bakedSlot >= 0 ? moving * FxgiDirectVisibility(bakedSlot, lightIndex, worldPosition,
		                                     geometricNormal, lightDirection, detailWeight)
		                      : 0.0;

	int dynamicSlot = LightShadowSlot(lightIndex);
	// keep the detailed soft-shadow path; current panel geometry also covers static-only caches.
	if (dynamicSlot >= 0 && dynamicSlot < 24)
		return moving * SamplePointShadow(u_shadowMaps, dynamicSlot, ShadowPositionFar(dynamicSlot),
		                    worldPosition, geometricNormal, lightDirection, detailWeight);
#if defined(S3D_VULKAN)
	int staticSlot = WorldLight(lightIndex).shadow.z;
#else
	int staticSlot = u_staticShadowSlots[lightIndex];
#endif
	if (staticSlot >= 0)
		return moving * SamplePointShadow(u_staticShadowMaps, staticSlot,
		                    vec4(LightPosition(lightIndex), max(LightParameters(lightIndex).x, 1.0)),
		                    worldPosition, geometricNormal, lightDirection, detailWeight);
	if (bakedSlot >= 0)
		return moving * FxgiDirectVisibility(bakedSlot, lightIndex, worldPosition, geometricNormal,
		                    lightDirection, detailWeight);
	return moving;
}

bool BloodInkEnabled()
{
#if defined(S3D_VULKAN)
	return u_bloodInkEnabled != 0 && (!WorldHasChunk() || worldChunks[worldChunkIndex].header.y != 0);
#else
	return u_bloodInkEnabled != 0;
#endif
}

float BloodGrainNoise(vec2 cell)
{
	return fract((cell.x * 0.1031 + cell.y * 0.11369 + 0.731 * 0.13787) * (cell.x + cell.y + 19.19));
}

vec2 BloodTexelSlope(vec2 cell)
{
	// Evaluate grain on the texture lattice, so the wet normal does not change
	// as a screen-space derivative quad crosses the edge of a blood pixel.
	return vec2(BloodGrainNoise(cell + vec2(1.0, 0.0)) - BloodGrainNoise(cell - vec2(1.0, 0.0)),
	           BloodGrainNoise(cell + vec2(0.0, 1.0)) - BloodGrainNoise(cell - vec2(0.0, 1.0))) *
	       0.035;
}

float WorldLightingDetail(vec3 lightingPosition)
{
	if (u_lightingLodMode == 0) return 1.0;
	if (u_lightingLodMode == 2) return 0.0;
	return 1.0 - smoothstep(
	                 u_lightingLodRange.x, u_lightingLodRange.y, length(lightingPosition - u_cameraPosition));
}

float WorldLightWeight(int rank, float detailWeight)
{
	// Reserve the same distant slot for the flashlight in both sides of the fade.
	int distantCount = max(u_distantLightCount - (u_chunkFlashlightIndex >= 0 ? 1 : 0), 0);
	if (rank >= distantCount && rank != u_chunkFlashlightIndex) return detailWeight;
	return 1.0;
}

float DistantDiffuse(vec3 surfaceNormal, vec3 lightDirection)
{
	return max(dot(surfaceNormal, lightDirection), 0.0) * 0.88;
}

float LocalLightAttenuation(int lightIndex, vec3 worldPosition, vec3 geometricNormal, out vec3 lightDirection,
    out float spot, out float sourceVariance)
{
	lightDirection = vec3(0.0);
	spot = 1.0;
	sourceVariance = 0.0;
	vec4 parameters = LightParameters(lightIndex);
	vec3 toLight = LightPosition(lightIndex) - worldPosition;
	float distanceSquared = dot(toLight, toLight);
	if (parameters.x <= 0.0 || parameters.y <= 0.0 || distanceSquared >= parameters.x * parameters.x)
		return 0.0;
	// Opaque geometry cannot receive a light lying behind its underlying plane.
	// Reject before cone math, shading, and shadow texture reads.
	if (dot(toLight, geometricNormal) <= 0.0) return 0.0;
	// Share one reciprocal square root between the direction and radial falloff.
	// Preserve the original sub-millimetre distance and normalization cap.
	float inverseDistance = inversesqrt(max(distanceSquared, 0.000001));
	float distanceToLight =
	    distanceSquared >= 0.000001 ? distanceSquared * inverseDistance : sqrt(distanceSquared);
	vec3 falloffData = LightFalloff(lightIndex);
	if (parameters.z > 0.5 && parameters.z < 2.5)
	{
		// Directions and fade widths are prepared once on the CPU. Reject outside
		// the cone before emitting-disc filtering or the material/shadow response.
		float coneWeight = clamp(
		    (dot(-toLight, LightDirection(lightIndex)) * inverseDistance - parameters.w) * falloffData.y, 0.0,
		    1.0);
		if (coneWeight <= 0.0) return 0.0;
		spot = coneWeight * coneWeight * (3.0 - 2.0 * coneWeight);
	}
	lightDirection = toLight * inverseDistance;
	if (WorldFacetRelay())
		sourceVariance = min(falloffData.z / max(distanceSquared + falloffData.z, 0.000001), 0.2);
	float falloff = 1.0 - distanceToLight * falloffData.x;
	return falloff * falloff * parameters.y;
}

float WorldAmbientOcclusion(float texelBakedAo, vec2 faceUv, int material)
{
	if (u_aoEnabled == 0) return 1.0;
	float bakedAoBand = clamp(texelBakedAo, 0.0, 1.0);
	float strength = max(u_aoStrength, 0.0);
	// These cases are exactly neutral, including after edge/contact modulation.
	if (bakedAoBand >= 1.0 || strength == 0.0 || material == u_emissiveMaterial) return 1.0;
	if (bakedAoFaceSize.x > 0.0 && bakedAoFaceSize.y > 0.0)
	{
		vec2 edgeDistance = min(faceUv, vec2(1.0) - faceUv) * bakedAoFaceSize;
		float contactDistance = min(edgeDistance.x, edgeDistance.y);
		float reach = max(u_aoRadius, 0.05);
		float contactWeight = 1.0 - smoothstep(reach * 0.08, reach, contactDistance);
		bakedAoBand = mix(1.0, bakedAoBand, contactWeight);
	}
	float occlusion = max(bakedAoBand, 0.02);
	return strength == 1.0 ? occlusion : pow(occlusion, strength);
}

bool HasFxgi() { return u_fxgiEnabled != 0 && fxgiChart.z > 0.0 && fxgiChart.w > 0.0; }

float FxgiBlend(bool mapped) { return mapped ? clamp(u_fxgiStrength, 0.0, 1.0) : 0.0; }

vec4 SampleFxgiAtlas(vec2 faceUv)
{
	if (!HasFxgi()) return vec4(0.0);
	// Texel snapping may extend beyond a trimmed face; stay inside its own chart.
	faceUv = clamp(faceUv, fxgiUvBounds.xy, fxgiUvBounds.zw);
	vec2 atlasUv = fxgiChart.xy + faceUv * fxgiChart.zw;
	// Empty cells have zero alpha. Normalize the filtered sample so hidden
	// portions of trimmed faces cannot darken their remaining visible edges.
	vec4 value = textureLod(u_fxgiAtlas, atlasUv, 0.0);
	value.rgb /= max(value.a, 0.0001);
	return value;
}

vec3 FxgiGlossyEnvironment(vec3 direction, float roughness)
{
	// first-order directional light handles broad gloss; sharp reflections need spatial detail too.
	float directionalWeight = 1.0 - 0.5 * roughness * roughness;
	vec4 basis = vec4(1.0, direction * directionalWeight);
	vec3 radiance =
	    max(vec3(dot(fxgiRadianceRed, basis), dot(fxgiRadianceGreen, basis), dot(fxgiRadianceBlue, basis)),
	        vec3(0.0));
	// the reflection response still works in the legacy pass's encoded color space.
	return sqrt(radiance * max(u_fxgiStrength, 0.0));
}

vec3 CombineFxgiDiffuse(vec3 baseColor, vec3 irradiance, vec3 existingColor)
{
	// The legacy pass reads encoded RGBA8 colors. Use a cheap gamma-2
	// approximation to combine its output with the linear baked light.
	vec3 linearBounce = baseColor * baseColor * max(irradiance, vec3(0.0)) * 1.62;
	return sqrt(max(existingColor * existingColor + linearBounce, vec3(0.0)));
}

float FxgiNormalResponse(vec3 geometricNormal, vec3 mappedNormal)
{
	if (u_normalStrength <= 0.0001) return 1.0;
	// reuse the baked incident field. mapped normals get bounce direction without another texture read.
	vec4 field = fxgiRadianceRed * 0.2126 + fxgiRadianceGreen * 0.7152 + fxgiRadianceBlue * 0.0722;
	float base = max(field.x + dot(field.yzw, geometricNormal) * (2.0 / 3.0), 0.0);
	float mapped = max(field.x + dot(field.yzw, mappedNormal) * (2.0 / 3.0), 0.0);
	return base > 0.0001 ? clamp(mapped / base, 0.65, 1.40) : 1.0;
}

vec3 DistantAmbient(vec3 geometricNormal, float ambientOcclusion)
{
	float hemisphere = geometricNormal.y * 0.5 + 0.5;
	return (vec3(0.045, 0.052, 0.072) + vec3(0.10, 0.12, 0.17) * hemisphere) * ambientOcclusion;
}

bool IsEmissiveImage(int material)
{
	if (material < 0 || material >= 256) return false;
	int word = material >> 5;
#if defined(S3D_VULKAN)
	uint mask = uint(worldFrame.emissiveImageMaterials[word >> 2][word & 3]);
#else
	uint mask = uint(u_emissiveImageMaterials[word]);
#endif
	return (mask & (1u << uint(material & 31))) != 0u;
}

float OutageFixtureEmission()
{
	for (int rank = 0; rank < ChunkLightCount(); ++rank)
	{
		if (rank == u_chunkFlashlightIndex) continue;
		int index = ChunkLightIndex(rank);
		if (LightParameters(index).y <= 0.0 || LightFalloff(index).z < .04) continue;
		vec3 offset = position - LightPosition(index);
		if (dot(offset, offset) < 2.56) return .86;
	}
	return .002;
}

vec4 FinishWorldColor(vec3 color, int material, vec3 materialAlbedo, float fog, float rodEnergy)
{
	if (!FxgiOnlyView()) color = LivingEyeWorldResponse(color, rodEnergy);
	if (material == u_emissiveMaterial || IsEmissiveImage(material))
	{
		float emission = u_powerOutage == 0 ? .86 : material == u_emissiveMaterial ? OutageFixtureEmission() : .002;
		vec3 fixture = instanceColor * materialAlbedo;
		if (material == u_emissiveMaterial && u_redAlert != 0 && abs(materialIndex) >= 1024)
			fixture = vec3(max(fixture.r, max(fixture.g, fixture.b))) * vec3(1, .018, .006);
		color += fixture * emission;
	}
	float peak = max(color.r, max(color.g, color.b));
	if (peak > 0.75 && !u_hdrOutput)
	{
		float excess = peak - 0.75;
		color *= (0.75 + 0.25 * excess / (excess + 0.25)) / peak;
	}
	return vec4(FxgiOnlyView() ? color : mix(color, u_fogColor, fog), 1.0);
}

vec4 FinishWorldColor(vec3 color, int material, vec3 materialAlbedo, float fog)
{
	return FinishWorldColor(color, material, materialAlbedo, fog, -1.0);
}

vec3 DistantWorldColor(vec3 baseColor, vec3 lightingPosition, vec3 geometricNormal, float ambientOcclusion,
    vec3 indirect, bool giMapped, bool projectedUv, float rodMask, out float rodEnergy)
{
	vec3 lighting = (DistantAmbient(geometricNormal, ambientOcclusion) * (u_powerOutage != 0 ? .08 : 1.0) +
	                    vec3(0.20, 0.18, 0.15) * DistantDiffuse(geometricNormal, -u_sunDirection) *
	                        (u_powerOutage != 0 ? 0.0 : 1.0)) *
	                (1.0 - FxgiBlend(giMapped));
	if (FxgiOnlyView()) lighting = vec3(0.0);
	uvec2 lightMasks = WorldLightMasks(lightingPosition, geometricNormal, projectedUv);
	while (any(notEqual(lightMasks, uvec2(0u))))
	{
		int rank = PopWorldLight(lightMasks);
		if (WorldLightWeight(rank, 0.0) <= 0.0) continue;
		int index = ChunkLightIndex(rank);
		vec3 direction;
		float spot, sourceVariance;
		float attenuation =
		    LocalLightAttenuation(index, lightingPosition, geometricNormal, direction, spot, sourceVariance);
		if (attenuation <= 0.0 || spot <= 0.0) continue;
		float diffuseResponse = DistantDiffuse(geometricNormal, direction);
		// A light behind this face cannot contribute diffuse light in the distant path.
		if (diffuseResponse <= 0.0) continue;
		attenuation *= PointShadowVisibility(index, lightingPosition, geometricNormal, direction, 0.0);
		attenuation *= spot;
		lighting += LightColor(index) * attenuation * diffuseResponse * 0.92;
	}
	vec3 color = baseColor * lighting * 1.62;
	rodEnergy = -1.0;
	if (u_livingEye.x > 0.0001 && rodMask < 0.999)
	{
		rodEnergy = RodLuminance(color * color) * rodMask;
		if (giMapped)
			rodEnergy += RodLuminance(baseColor * baseColor * indirect * mix(0.85, 1.0, ambientOcclusion)) *
			             rodMask * 1.62;
	}
	return giMapped ? CombineFxgiDiffuse(baseColor, indirect * mix(0.85, 1.0, ambientOcclusion), color)
	                : color;
}

bool IsStructuralMaterial(int material)
{
	if (material < 0 || material >= 256) return false;
	int word = material >> 5;
#if defined(S3D_VULKAN)
	uint mask = uint(worldFrame.structuralMaterials[word >> 2][word & 3]);
#else
	uint mask = uint(u_structuralMaterials[word]);
#endif
	return (mask & (1u << uint(material & 31))) != 0u;
}

void main()
{
	// Models use -(layer + 1); disks reserve -513-layer for shell tinting.
	int surfaceMaterial = materialIndex - (materialIndex >= 1024 ? 1024 : materialIndex <= -1024 ? -1024 : 0);
	bool tintedDisk = surfaceMaterial <= -513;
	bool authoredUv = surfaceMaterial < 0;
	bool metricDoor = surfaceMaterial >= 256;
	int material =
	    tintedDisk ? -surfaceMaterial - 513
	               : (authoredUv ? -surfaceMaterial - 1 : (metricDoor ? surfaceMaterial - 256 : surfaceMaterial));
	vec3 geometricNormal = NormalizeSurfaceDirection(normal, vec3(0.0, 1.0, 0.0));
	vec3 absoluteNormal = abs(geometricNormal);
	vec2 surface = absoluteNormal.y > max(absoluteNormal.x, absoluteNormal.z)
	                   ? texturePosition.xz
	                   : (absoluteNormal.x > absoluteNormal.z ? texturePosition.zy : texturePosition.xy);
	const float structuralTextureScale = 0.125;
	bool structural = material == u_floorMaterial || material == u_wallMaterial ||
	                  material == u_ceilingMaterial || material == u_panelMaterial ||
	                  IsStructuralMaterial(material);
	metricDoor = metricDoor || material == u_doorLeftMaterial || material == u_doorRightMaterial;
	float textureScale = metricDoor ? .25 : (structural ? structuralTextureScale : 0.24);
	bool fixedImage =
	    authoredUv || (material >= u_fixedPuzzleFirstMaterial && material <= u_fixedPuzzleLastMaterial);
	vec2 materialUv = fixedImage ? clamp(boxUv, vec2(0.004), vec2(0.996)) : surface * textureScale;
	// Every lighting term uses this same authored texel centre. Keep the original
	// UV derivatives for texture LOD and tangent frames; snapped UVs have discontinuities.
	vec2 materialTextureSize = vec2(textureSize(u_albedoMaps, 0).xy);
	if (metricDoor) materialTextureSize = vec2(64.0);
	// Disk artwork is natively 16px; its nearest-expanded array layer must also
	// use that grid for lighting and sampling instead of inventing 128px detail.
	if (tintedDisk) materialTextureSize = vec2(16.0);
	vec2 texelScreenOffset = S3DTexelScreenOffset(materialUv, materialTextureSize);
	vec4 faceBounds = HasFxgi() ? fxgiUvBounds : vec4(0.0, 0.0, 1.0, 1.0);
	vec2 boundedOffset = S3DClampTexelOffset(boxUv, texelScreenOffset, faceBounds);
	texelScreenOffset = authoredUv ? texelScreenOffset : boundedOffset;
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
	geometricNormal = NormalizeSurfaceDirection(S3DTexelValue(normal, texelScreenOffset), geometricNormal);
	vec2 faceUv = clamp(S3DTexelValue(boxUv, texelScreenOffset), vec2(0.0), vec2(1.0));
	float texelBakedAo = S3DTexelValue(bakedAmbientOcclusion, texelScreenOffset);
	float fog = smoothstep(u_fogNear, u_fogFar, length(position - u_cameraPosition));
	bool diagnosticView = FxgiOnlyView();
	if (u_fullbright == 0 && !diagnosticView && fog >= 1.0)
	{
		FragColor = vec4(u_fogColor, 1.0);
		return;
	}
	// Fixture lenses and small indicators are solid color; puzzle screens retain their images.
	vec4 albedoSample = material == u_emissiveMaterial
	                        ? vec4(1.0)
	                        : textureGrad(u_albedoMaps, vec3(sampleUv, float(material)), uvDx, uvDy);
	vec3 materialAlbedo = albedoSample.rgb;
	vec3 surfaceTint = material == u_emissiveMaterial ? instanceColor : mix(vec3(1.0), instanceColor, 0.42);
	if (tintedDisk)
	{
		// The paper label and metal shutter retain their neutral artwork; only
		// the ABS shell receives the required disk colour. No extra texture fetch.
		float label = step(.08, boxUv.x) * step(boxUv.x, .92) * step(.035, boxUv.y) * step(boxUv.y, .56);
		float shutter = step(.20, boxUv.x) * step(boxUv.x, .81) * step(.64, boxUv.y);
		surfaceTint = mix(max(instanceColor, vec3(.025)), vec3(1.0), max(label, shutter));
	}
	vec3 baseColor = surfaceTint * materialAlbedo;
	float bloodMask = BloodInkEnabled() ? WorldBloodMask(lightingPosition, bloodSurface) : 0.0;
	baseColor = mix(baseColor, BLOOD_BASE_COLOR, bloodMask);
	float rodMask = mix(albedoSample.a, 1.0, bloodMask);
	if (u_fullbright != 0 && !FxgiOnlyView())
	{
		FragColor = vec4(baseColor, 1.0);
		return;
	}
	// Unlit fixtures and advertising screens skip surface-lighting work.
	if (material == u_emissiveMaterial || IsEmissiveImage(material))
	{
		FragColor = FinishWorldColor(vec3(0.0), material, materialAlbedo, fog);
		return;
	}
	float ambientOcclusion = WorldAmbientOcclusion(texelBakedAo, faceUv, material);
	vec4 giSample = SampleFxgiAtlas(faceUv);
	bool giMapped = HasFxgi() && giSample.a > 0.0001;
	float giBlend = FxgiBlend(giMapped);
	vec3 indirect = vec3(0.0);
	if (giMapped) indirect = giSample.rgb * max(u_fxgiStrength, 0.0);

	// This draw-wide branch keeps all derivative operations uniform while
	// distant chunks skip normal maps, surface maps and the detailed BRDF.
	if (u_lightingLodMode == 2 && (u_surfaceFlags & 4) == 0)
	{
		float rodEnergy;
		vec3 color = DistantWorldColor(baseColor, lightingPosition, geometricNormal, ambientOcclusion,
		    indirect, giMapped, !fixedImage, rodMask, rodEnergy);
		FragColor = FinishWorldColor(color, material, materialAlbedo, fog, rodEnergy);
		return;
	}
	float detailWeight = WorldLightingDetail(lightingPosition);
	vec4 normalSample = textureGrad(u_normalMaps, vec3(sampleUv, float(material)), uvDx, uvDy);
	vec3 mappedNormal = normalSample.xyz * 2.0 - 1.0;
	vec4 surfaceProperties = textureGrad(u_surfaceMaps, vec3(sampleUv, float(material)), uvDx, uvDy);
	float specularLevel = surfaceProperties.r;
	float smoothness = surfaceProperties.g;
	float metallic = surfaceProperties.b * detailWeight;
	float anisotropy = surfaceProperties.a;
	// Mip alpha retains normal dispersion instead of discarding it during
	// renormalization. Fold unresolved slopes into roughness to stabilize glints.
	float normalVariance = max(1.0 - normalSample.a, 0.0) * min(u_normalStrength * u_normalStrength, 4.0);
	smoothness =
	    1.0 - sqrt(clamp((1.0 - smoothness) * (1.0 - smoothness) + normalVariance * 0.4, 0.001225, 0.9216));
	mappedNormal.y = -mappedNormal.y;
	mappedNormal.xy *= u_normalStrength;
	mappedNormal = NormalizeSurfaceDirection(mappedNormal, vec3(0.0, 0.0, 1.0));
	mat3 surfaceFrame = CotangentFrame(geometricNormal, positionDx, positionDy, tangentUvDx, tangentUvDy);
	vec3 mappedWorldNormal = NormalizeSurfaceDirection(surfaceFrame * mappedNormal, geometricNormal);
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
	vec3 viewDirection = NormalizeSurfaceDirection(u_cameraPosition - lightingPosition, geometricNormal);
	N = SurfaceViewNormal(geometricNormal, N, viewDirection);
	float normalView = max(dot(N, viewDirection), 0.0);
	if ((u_surfaceFlags & 4) != 0)
	{
		FragColor = vec4(dot(N, viewDirection) <= 0.0 ? vec3(1.0, 0.02, 0.01) : N * 0.5 + 0.5, 1.0);
		return;
	}
	bool facetRelay = WorldFacetRelay();
	float reflectance = SpecularReflectance(specularLevel);
	vec3 reflectanceColor =
	    mix(vec3(0.018 + 0.062 * specularLevel), clamp(baseColor, vec3(0.08), vec3(0.9)), metallic);
	vec3 diffuseColor = baseColor * (1.0 - metallic);
	bool livingEye = u_livingEye.x > 0.0001 && rodMask < 0.999;
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
	if (u_fastSpecular == 0 && reflectionStrength > 0.0 && (!facetRelay || anisotropy > 0.0))
	{
		// Isotropic Facet Relay lobes have zero tangent precision; their shoulder
		// still uses the same detailed response without constructing this frame.
		mat3 specularFrame = SurfaceSpecularFrame(N, surfaceFrame[0]);
		tangentValue = specularFrame[0];
		bitangentValue = specularFrame[1];
		if (!facetRelay)
			viewMask +=
			    BeckmannLambda(viewDirection, tangentValue, bitangentValue, detailedResponse, normalView);
	}
	// PrepareFacetRelay initializes every field before either guarded use below.
	// Keep this declaration independent of the include's internal field count.
	FacetRelayParameters facetParameters;
	if (facetRelay)
		facetParameters = PrepareFacetRelay(geometricNormal, N, viewDirection, roughness, reflectanceColor,
		    reflectionStrength, u_fastSpecular == 0, anisotropy);
	float hemisphere = N.y * 0.5 + 0.5;

	float normalCavity =
	    material == u_emissiveMaterial ? 1.0 : mix(0.72, 1.0, smoothstep(0.35, 0.98, mappedNormal.z));
	vec3 ambientField =
	    (vec3(0.045, 0.052, 0.072) + vec3(0.10, 0.12, 0.17) * hemisphere) * ambientOcclusion * normalCavity;

	ambientField = mix(DistantAmbient(geometricNormal, ambientOcclusion), ambientField, detailWeight);
	ambientField *= FxgiOnlyView() ? 0.0 : (1.0 - giBlend) * (u_powerOutage != 0 ? .08 : 1.0);

	// Computed GI replaces this legacy fill; skip its response when fully faded.
	vec3 sunColor = vec3(0.20, 0.18, 0.15) * (1.0 - giBlend) * (u_powerOutage != 0 ? 0.0 : 1.0);
	vec3 directDiffuse = vec3(0.0), directReflection = vec3(0.0);
	if (giBlend < 1.0 && !FxgiOnlyView())
	{
		vec3 sunDirection = -u_sunDirection;
		float sunDiffuse;
		if (facetRelay)
		{
			vec4 response = EvaluateFacetRelay(
			    geometricNormal, N, tangentValue, viewDirection, sunDirection, 0.0001, facetParameters);
			sunDiffuse = mix(DistantDiffuse(geometricNormal, sunDirection), response.x, detailWeight);
			directReflection = sunColor * response.yzw;
		}
		else
		{
			sunDiffuse = mix(DistantDiffuse(geometricNormal, sunDirection),
			    RelayDiffuse(N, viewDirection, sunDirection, diffuseParameters, normalView), detailWeight);
			directReflection = SurfaceReflection(sunColor, N, tangentValue, bitangentValue, viewDirection,
			    sunDirection, reflectionStrength, fastResponse, detailedResponse, normalView, viewMask);
		}
		directDiffuse = diffuseColor * sunColor * sunDiffuse;
	}
	vec3 reflectionDirection = reflect(-viewDirection, N);
	float reflectedSky = reflectionDirection.y * 0.5 + 0.5;
	vec3 environmentField = mix(u_fogColor * 0.55, vec3(0.30, 0.39, 0.52), reflectedSky);
	if (u_powerOutage != 0) environmentField *= .01;
	if (FxgiOnlyView()) environmentField = vec3(0.0);
	if (giMapped)
		environmentField = mix(environmentField, FxgiGlossyEnvironment(reflectionDirection, roughness),
		    FxgiOnlyView() ? 1.0 : giBlend);
	environmentField *= mix(ambientOcclusion, 1.0, 0.44);

	uvec2 lightMasks = WorldLightMasks(lightingPosition, geometricNormal, !fixedImage);
	while (any(notEqual(lightMasks, uvec2(0u))))
	{
		int rank = PopWorldLight(lightMasks);
		float lightWeight = WorldLightWeight(rank, detailWeight);
		if (lightWeight <= 0.0) continue;
		int lightIndex = ChunkLightIndex(rank);
		vec3 localLightDirection;
		float spot, sourceVariance;
		float attenuation = LocalLightAttenuation(
		    lightIndex, lightingPosition, geometricNormal, localLightDirection, spot, sourceVariance);
		if (attenuation <= 0.0 || spot <= 0.0) continue;
		float diffuseResponse;
		vec3 facetSpecular = vec3(0.0);
		if (facetRelay)
		{
			vec4 response = EvaluateFacetRelay(geometricNormal, N, tangentValue, viewDirection,
			    localLightDirection, sourceVariance, facetParameters);
			diffuseResponse =
			    mix(DistantDiffuse(geometricNormal, localLightDirection), response.x, detailWeight);
			facetSpecular = response.yzw;
		}
		else
			diffuseResponse = mix(DistantDiffuse(geometricNormal, localLightDirection),
			    RelayDiffuse(N, viewDirection, localLightDirection, diffuseParameters, normalView),
			    detailWeight);
		// Skip shadow reads when neither component can receive this light.
		if (diffuseResponse <= 0.0 && (facetRelay ? all(lessThanEqual(facetSpecular, vec3(0.0)))
		                                          : (reflectionStrength <= 0.0 || normalView <= 0.0 ||
		                                                dot(N, localLightDirection) <= 0.0)))
			continue;
		// shadows share the art texel's receiver, including its clipped centre at a face boundary.
		attenuation *= PointShadowVisibility(
		    lightIndex, lightingPosition, geometricNormal, localLightDirection, detailWeight);
		if (attenuation <= 0.0) continue;
		attenuation *= spot;
		attenuation *= lightWeight;
		vec3 lightColor = LightColor(lightIndex);
		directDiffuse += diffuseColor * lightColor * attenuation * diffuseResponse * 0.92;
		if (detailWeight > 0.0)
		{
			if (facetRelay)
				directReflection += lightColor * attenuation * facetSpecular;
			else
				directReflection += SurfaceReflection(lightColor * attenuation, N, tangentValue,
				    bitangentValue, viewDirection, localLightDirection, reflectionStrength, fastResponse,
				    detailedResponse, normalView, viewMask);
		}
	}

	vec3 environmentReflection = facetRelay ? FacetRelayEnvironment(environmentField, normalView,
	                                              reflectanceColor, roughness, reflectionStrength)
	                                        : EnvironmentReflection(environmentField, normalView, reflectance,
	                                              smoothness, reflectionStrength);
	vec3 reflectedLight = facetRelay ? CompressFacetRelayReflection(directReflection + environmentReflection)
	                                 : CompressSurfaceReflection(directReflection + environmentReflection);
	vec3 diffuse = diffuseColor * ambientField * 1.62 + directDiffuse * 1.62;
	vec3 color = diffuse + reflectedLight;
	float rodEnergy = -1.0;
	if (livingEye)
	{
		// use the already shaded diffuse: no duplicate light loops or visibility rays.
		vec3 rodColor = diffuse * sqrt(max(rodMask, 0.0)) + reflectedLight;
		rodEnergy = RodLuminance(rodColor * rodColor);
	}
	if (giMapped)
	{
		vec3 bounce = indirect * (1.0 - metallic) * mix(0.85, 1.0, ambientOcclusion) *
		              mix(1.0, normalCavity, detailWeight);
		if (detailWeight > 0.001) bounce *= FxgiNormalResponse(geometricNormal, N);
		if (livingEye) rodEnergy += RodLuminance(baseColor * baseColor * bounce) * rodMask * 1.62;
		color = CombineFxgiDiffuse(baseColor, bounce, color);
	}
	FragColor = FinishWorldColor(color, material, materialAlbedo, fog, rodEnergy);
}
