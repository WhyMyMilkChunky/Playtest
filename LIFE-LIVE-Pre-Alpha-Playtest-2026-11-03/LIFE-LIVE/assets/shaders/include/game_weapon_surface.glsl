#include "s3d_backend.glsl"
#include "s3d_pixel_grid.glsl"
#include "game_reflection.glsl"
#include "game_surface_frame.glsl"

#if defined(S3D_VULKAN) || defined(S3D_GPU_MODEL)
#define S3D_PORTABLE_MODEL 1
#endif

// fading corpses must discard before depth writes; the other models can force early tests.
#if !defined(S3D_PROCEDURAL_GORE) || defined(S3D_GORE_DEBRIS)
layout(early_fragment_tests) in;
#endif
layout(location = 0) out vec4 FragColor;

#if defined(S3D_PORTABLE_MODEL)
#include "game_model_gpu.glsl"
const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;
layout(location = 0) in vec3 localPosition;
layout(location = 1) in vec3 surfaceNormal;
layout(location = 2) in vec2 uv;
layout(location = 3) flat in vec4 materialSettings;
layout(location = 4) in vec3 bodyPosition;
#if defined(S3D_PROCEDURAL_GORE)
layout(location = 5) flat in uint goreMaterial;
layout(location = 6) in float tissueDepth;
#if !defined(S3D_GORE_DEBRIS)
layout(location = 7) flat in uint woundOffset;
layout(location = 8) flat in float bodyFade;
#endif
#else
layout(location = 5) flat in vec4 woundSpheres[WOUND_COUNT];
layout(location = 13) flat in vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
#endif
layout(location = 15) flat in float bodyRegion;
layout(location = 16) flat in vec4 indirectRed;
layout(location = 17) flat in vec4 indirectGreen;
layout(location = 18) flat in vec4 indirectBlue;
#define u_indirectRed indirectRed
#define u_indirectGreen indirectGreen
#define u_indirectBlue indirectBlue
#define u_normalStrength materialSettings.x
#define u_specularStrength materialSettings.y
#define u_opacity materialSettings.z
#define u_sunDirection modelFrame.sunDirection.xyz
#define u_worldUp modelFrame.worldUp.xyz
#define u_modelFxgiOnly (modelFrame.worldUp.w > 0.5 ? 1 : 0)
#define u_environmentColor modelFrame.environmentColor.xyz
#define u_fastSpecular int(modelFrame.environmentColor.w)
#define u_lightCount int(materialSettings.w)
#else
const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;
in vec3 localPosition;
in vec3 surfaceNormal;
in vec2 uv;
in vec3 bodyPosition;
// Legacy GL draws one character per draw. These values are already uniforms;
// carrying ten flat vec4s through every vertex duplicates the same data.
uniform vec4 u_woundSpheres[WOUND_COUNT];
uniform vec4 u_woundRegions[WOUND_REGION_VECTOR_COUNT];
#define woundSpheres u_woundSpheres
#define woundRegions u_woundRegions
flat in float bodyRegion;
#endif

#if !defined(S3D_GORE_DEBRIS)
S3D_RESOURCE(1, 0) uniform sampler2D u_albedo;
S3D_RESOURCE(1, 1) uniform sampler2D u_normalMap;
S3D_RESOURCE(1, 2) uniform sampler2D u_specularMap;
S3D_RESOURCE(1, 3) uniform sampler2D u_smoothnessMap;
#endif
#if defined(S3D_PROCEDURAL_GORE)
S3D_RESOURCE(1, 4) uniform sampler2DArray u_tissueMap;
S3D_RESOURCE(1, 5) uniform sampler2DArray u_tissueNormal;
#if !defined(S3D_GORE_DEBRIS)
struct GoreMark { vec4 positionRadius, normalDepth; };
S3D_RESOURCE(0, 3) layout(std430) readonly buffer GoreMarks { GoreMark goreMarks[]; };
#endif
#endif
#if !defined(S3D_PORTABLE_MODEL)
uniform float u_normalStrength;
uniform float u_specularStrength;
uniform int u_fastSpecular;
uniform float u_opacity;
uniform vec3 u_sunDirection;
uniform vec3 u_worldUp;
uniform int u_modelFxgiOnly;
uniform vec3 u_environmentColor;
uniform vec4 u_indirectRed;
uniform vec4 u_indirectGreen;
uniform vec4 u_indirectBlue;
uniform int u_lightCount;
uniform vec3 u_lightPositions[24];
uniform vec3 u_lightColors[24];
uniform vec3 u_lightDirections[24];
uniform vec4 u_lightParameters[24];
#endif

vec3 ModelLightPosition(int index)
{
#if defined(S3D_PORTABLE_MODEL)
	return modelFrame.lights[index].position.xyz;
#else
	return u_lightPositions[index];
#endif
}

vec3 ModelLightColor(int index)
{
#if defined(S3D_PORTABLE_MODEL)
	return modelFrame.lights[index].color.xyz;
#else
	return u_lightColors[index];
#endif
}

vec3 ModelLightDirection(int index)
{
#if defined(S3D_PORTABLE_MODEL)
	return modelFrame.lights[index].direction.xyz;
#else
	return u_lightDirections[index];
#endif
}

vec4 ModelLightParameters(int index)
{
#if defined(S3D_PORTABLE_MODEL)
	return modelFrame.lights[index].parameters;
#else
	return u_lightParameters[index];
#endif
}

#include "game_model_response.glsl"

#if !defined(S3D_PROCEDURAL_GORE)
float WoundRegion(int index)
{
	vec4 regionSet = woundRegions[index / 4];
	int component = index % 4;
	if (component == 0) return regionSet.x;
	if (component == 1) return regionSet.y;
	if (component == 2) return regionSet.z;
	return regionSet.w;
}

bool WoundTouchesRegion(float woundRegion)
{
	if (bodyRegion < 0.0 || woundRegion < 0.0) return true;
	int first = int(bodyRegion + 0.5), second = int(woundRegion + 0.5);
	if (first == second) return true;
	if (first >= 11 || second >= 11) return false;
	const int parent[11] = int[11](-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9);
	return parent[first] == second || parent[second] == first;
}

float ApplyWounds(inout vec3 albedo, inout float specularLevel, inout float smoothness, vec3 woundPosition)
{
	float depth = 0.0;
	for (int woundIndex = 0; woundIndex < WOUND_COUNT; ++woundIndex)
	{
		vec4 wound = woundSpheres[woundIndex];
		// Wounds are packed from the front, so an empty slot means the rest are
		// empty too. This keeps unwounded and lightly wounded bodies inexpensive.
		if (wound.w <= 0.0) break;
		float woundRegion = WoundRegion(woundIndex);
		if (!WoundTouchesRegion(woundRegion)) continue;
		vec3 woundOffset = woundPosition - wound.xyz;
		float inverseRadius = 1.0 / max(wound.w, 0.001);
		float radialDistanceSquared = dot(woundOffset, woundOffset) * inverseRadius * inverseRadius;
		// The irregular edge can shrink distance by at most 12%, so fragments
		// outside this bound cannot possibly be touched by the wound.
		if (radialDistanceSquared >= 1.292) continue;
		float radialDistance = sqrt(radialDistanceSquared);
		float irregularity = 0.94 + 0.06 * sin(dot(woundOffset, vec3(83.0, 57.0, 71.0)) * inverseRadius);
		radialDistance *= irregularity;
		if (radialDistance >= 1.0) continue;
		float tornEdge = 1.0 - smoothstep(0.70, 1.0, radialDistance);
		float deepCavity = 1.0 - smoothstep(0.12, 0.58, radialDistance);
		albedo = mix(albedo, vec3(0.24, 0.006, 0.008), tornEdge);
		albedo = mix(albedo, vec3(0.018, 0.001, 0.001), deepCavity);
		float wetTissue = max(tornEdge * 0.82, deepCavity * 0.46);
		specularLevel = max(specularLevel, wetTissue);
		smoothness = max(smoothness, max(tornEdge * 0.88, deepCavity * 0.62));
		depth = min(depth, -deepCavity * min(wound.w * 0.20, 0.025));
	}
	return depth;
}

#endif

#if defined(S3D_PROCEDURAL_GORE) && !defined(S3D_GORE_DEBRIS)
float ApplyCorpseMarks(inout vec3 albedo, inout vec3 mappedNormal, inout float specularLevel,
	inout float smoothness, vec3 point, vec2 sampleUv, vec2 uvDx, vec2 uvDy)
{
	if (woundOffset == 0xffffffffu) return 0.0;
	float coverage = 0.0, depth = 0.0;
	for (uint i = 0u; i < 8u; ++i)
	{
		GoreMark mark = goreMarks[woundOffset + i];
		if (mark.positionRadius.w <= 0.0) break;
		vec3 offset = point - mark.positionRadius.xyz;
		float radius = mark.positionRadius.w;
		float distanceSquared = dot(offset, offset) / (radius * radius);
		if (distanceSquared >= 1.2) continue;
		float distance = sqrt(distanceSquared) * (0.95 + 0.05 * sin(dot(offset, vec3(83.0, 57.0, 71.0)) / radius));
		float thickness = max(0.012, radius * 0.5);
		float plane = 1.0 - smoothstep(thickness * 0.65, thickness, abs(dot(offset, mark.normalDepth.xyz)));
		float rim = (1.0 - smoothstep(0.65, 1.0, distance)) * plane;
		float core = (1.0 - smoothstep(0.08, 0.58, distance)) * plane;
		coverage = max(coverage, rim);
		depth = min(depth, -core * mark.normalDepth.w);
	}
	if (coverage > 0.001)
	{
		vec2 ratio = vec2(textureSize(u_albedo, 0)) / vec2(textureSize(u_tissueMap, 0).xy);
		vec2 tissueUv = fract(sampleUv * ratio);
		vec3 flesh = textureGrad(u_tissueMap, vec3(tissueUv, 0.0), uvDx * ratio, uvDy * ratio).rgb;
		vec3 normal = textureGrad(u_tissueNormal, vec3(tissueUv, 0.0), uvDx * ratio, uvDy * ratio).xyz * 2.0 - 1.0;
		albedo = mix(albedo, flesh * 0.65, coverage);
		albedo *= 1.0 - smoothstep(0.001, 0.025, -depth) * 0.65;
		mappedNormal = normalize(mix(mappedNormal, normal, coverage));
		specularLevel = max(specularLevel, coverage * 0.68);
		smoothness = max(smoothness, coverage * 0.80);
	}
	return depth;
}
#endif

void main()
{
	vec2 authoredUv = clamp(uv, vec2(0.004), vec2(0.996));
#if defined(S3D_PROCEDURAL_GORE)
	if (goreMaterial != 0u) authoredUv = fract(uv);
#endif
#if defined(S3D_GORE_DEBRIS)
	vec2 materialTextureSize = vec2(textureSize(u_tissueMap, 0).xy);
#else
	vec2 materialTextureSize = vec2(textureSize(u_albedo, 0));
#endif
#if defined(S3D_PROCEDURAL_GORE)
#if defined(S3D_GORE_DEBRIS)
	bool tissue = true;
#else
	bool tissue = goreMaterial != 0u;
#endif
	if (tissue) materialTextureSize = vec2(textureSize(u_tissueMap, 0).xy);
#endif
	vec2 texelScreenOffset = S3DTexelScreenOffset(authoredUv, materialTextureSize);
	vec2 sampleUv = S3DTexelCenter(authoredUv, materialTextureSize);
#if defined(S3D_PROCEDURAL_GORE)
	vec2 uvDx = dFdx(uv);
	vec2 uvDy = dFdy(uv);
#else
	vec2 uvDx = dFdx(authoredUv);
	vec2 uvDy = dFdy(authoredUv);
#endif
	vec3 positionDx = dFdx(localPosition);
	vec3 positionDy = S3D_DFDY(localPosition);
	vec2 tangentUvDx = dFdx(uv);
	vec2 tangentUvDy = S3D_DFDY(uv);
	vec3 lightingPosition = S3DTexelValue(localPosition, texelScreenOffset);
	vec3 geometricNormal = normalize(S3DTexelValue(surfaceNormal, texelScreenOffset));
	vec3 woundPosition = S3DTexelValue(bodyPosition, texelScreenOffset);
	vec3 albedo, mappedNormal;
	float specularLevel, smoothness;
	float woundHeight = 0.0;
#if defined(S3D_PROCEDURAL_GORE)
	if (!gl_FrontFacing) geometricNormal = -geometricNormal;
#endif
	// derivatives are evaluated before the material branch, including on the torn rim.
	mat3 surfaceFrame = CotangentFrame(geometricNormal, positionDx, positionDy, tangentUvDx, tangentUvDy);
#if defined(S3D_PROCEDURAL_GORE)
	if (tissue)
	{
		if (goreMaterial == 5u)
			albedo = textureGrad(u_tissueMap, vec3(sampleUv, bodyRegion == 1.0 ? 3.0 : 4.0), uvDx, uvDy).rgb;
		else if (goreMaterial == 2u)
			albedo = textureGrad(u_tissueMap, vec3(sampleUv, 1.0), uvDx, uvDy).rgb;
		else if (goreMaterial == 4u)
			albedo = textureGrad(u_tissueMap, vec3(sampleUv, 3.0), uvDx, uvDy).rgb;
		else
		{
			vec3 muscle = textureGrad(u_tissueMap, vec3(sampleUv, 0.0), uvDx, uvDy).rgb;
			vec3 fat = textureGrad(u_tissueMap, vec3(sampleUv, 2.0), uvDx, uvDy).rgb;
			albedo = goreMaterial == 3u ? fat : mix(fat, muscle, smoothstep(0.002, 0.012, tissueDepth));
			if (bodyRegion == 1.0 && tissueDepth > 0.055)
				albedo = mix(albedo, textureGrad(u_tissueMap, vec3(sampleUv, 3.0), uvDx, uvDy).rgb,
				    smoothstep(0.055, 0.11, tissueDepth));
		}
		float normalLayer = goreMaterial == 2u ? 1.0 : goreMaterial == 3u ? 2.0 :
			goreMaterial == 4u ? 3.0 : goreMaterial == 5u ? (bodyRegion == 1.0 ? 3.0 : 4.0) :
			(bodyRegion == 1.0 && tissueDepth > 0.08 ? 3.0 : 0.0);
		mappedNormal = textureGrad(u_tissueNormal, vec3(sampleUv, normalLayer), uvDx, uvDy).xyz * 2.0 - 1.0;
		specularLevel = goreMaterial == 2u ? 0.28 : 0.62;
		smoothness = goreMaterial == 2u ? 0.38 : goreMaterial == 4u ? 0.86 : 0.76;
	}
#if !defined(S3D_GORE_DEBRIS)
	else
#endif
#endif
#if !defined(S3D_GORE_DEBRIS)
	{
		albedo = textureGrad(u_albedo, sampleUv, uvDx, uvDy).rgb;
		mappedNormal = textureGrad(u_normalMap, sampleUv, uvDx, uvDy).xyz * 2.0 - 1.0;
		specularLevel = textureGrad(u_specularMap, sampleUv, uvDx, uvDy).r;
		smoothness = textureGrad(u_smoothnessMap, sampleUv, uvDx, uvDy).r;
#if !defined(S3D_PROCEDURAL_GORE)
		woundHeight = ApplyWounds(albedo, specularLevel, smoothness, woundPosition);
#else
		// the torn rim keeps the skin uv density as it exposes tissue.
		float exposure = smoothstep(0.001, 0.018, S3DTexelValue(tissueDepth, texelScreenOffset));
		if (exposure > 0.001)
		{
			// one tissue texel per skin texel. UVs stay attached through dents and ragdoll motion.
			vec2 tissueRatio = vec2(textureSize(u_albedo, 0)) / vec2(textureSize(u_tissueMap, 0).xy);
			vec2 tissueUv = fract(sampleUv * tissueRatio);
			vec3 flesh = textureGrad(u_tissueMap, vec3(tissueUv, 0.0), uvDx * tissueRatio, uvDy * tissueRatio).rgb;
			albedo = mix(albedo, flesh, exposure);
			vec3 fleshNormal = textureGrad(u_tissueNormal, vec3(tissueUv, 0.0),
				uvDx * tissueRatio, uvDy * tissueRatio).xyz * 2.0 - 1.0;
			mappedNormal = normalize(mix(mappedNormal, fleshNormal, exposure));
			specularLevel = mix(specularLevel, 0.58, exposure);
			smoothness = mix(smoothness, 0.72, exposure);
		}
#endif
	}

#endif
#if defined(S3D_PROCEDURAL_GORE) && !defined(S3D_GORE_DEBRIS)
	woundHeight = ApplyCorpseMarks(albedo, mappedNormal, specularLevel, smoothness,
		woundPosition, sampleUv, uvDx, uvDy);
#endif
	// take derivatives after the wound loop, outside its per-pixel branches.
	float woundDx = dFdx(woundHeight), woundDy = S3D_DFDY(woundHeight);
#if defined(S3D_PROCEDURAL_GORE) && !defined(S3D_GORE_DEBRIS)
	if (bodyFade < 1.0)
	{
		uvec3 cell = uvec3(ivec3(floor(bodyPosition * 64.0)));
		uint hash = cell.x * 73856093u ^ cell.y * 19349663u ^ cell.z * 83492791u;
		hash = (hash ^ (hash >> 16u)) * 0x7feb352du;
		if (float(hash >> 8u) * (1.0 / 16777216.0) >= bodyFade) discard;
	}
#endif
	mappedNormal.y = -mappedNormal.y;
	mappedNormal.xy *= 2.25 * u_normalStrength;
	mappedNormal = normalize(mappedNormal);
	vec3 N = normalize(mix(geometricNormal, normalize(surfaceFrame * mappedNormal), 0.92));
	if (abs(woundDx) + abs(woundDy) > 1e-7)
	{
		vec3 first = cross(positionDy, geometricNormal), second = cross(geometricNormal, positionDx);
		float determinant = dot(positionDx, first);
		if (abs(determinant) > 1e-10)
			N = normalize(N - (first * woundDx + second * woundDy) / determinant);
	}
	vec3 viewDirection = normalize(-lightingPosition);
	N = SurfaceViewNormal(geometricNormal, N, viewDirection);
	vec3 color = ModelLightingResponse(albedo, N, viewDirection, lightingPosition, surfaceFrame[0],
	    specularLevel, smoothness);
	FragColor = vec4(color, u_opacity);
}
