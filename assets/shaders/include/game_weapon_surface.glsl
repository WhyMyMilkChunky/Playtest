#include "s3d_backend.glsl"
#include "s3d_pixel_grid.glsl"
#include "game_reflection.glsl"
#include "game_surface_frame.glsl"

#if defined(S3D_VULKAN) || defined(S3D_GPU_MODEL)
#define S3D_PORTABLE_MODEL 1
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
layout(location = 5) flat in vec4 woundSpheres[WOUND_COUNT];
layout(location = 13) flat in vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
layout(location = 15) flat in float bodyRegion;
#define u_normalStrength materialSettings.x
#define u_specularStrength materialSettings.y
#define u_opacity materialSettings.z
#define u_sunDirection modelFrame.sunDirection.xyz
#define u_worldUp modelFrame.worldUp.xyz
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
flat in vec4 woundSpheres[WOUND_COUNT];
flat in vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
flat in float bodyRegion;
#endif

S3D_RESOURCE(1, 0) uniform sampler2D u_albedo;
S3D_RESOURCE(1, 1) uniform sampler2D u_normalMap;
S3D_RESOURCE(1, 2) uniform sampler2D u_specularMap;
S3D_RESOURCE(1, 3) uniform sampler2D u_smoothnessMap;
#if !defined(S3D_PORTABLE_MODEL)
uniform float u_normalStrength;
uniform float u_specularStrength;
uniform int u_fastSpecular;
uniform float u_opacity;
uniform vec3 u_sunDirection;
uniform vec3 u_worldUp;
uniform vec3 u_environmentColor;
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

float PixelLightResponse(float value)
{
	float banded = floor(clamp(value, 0.0, 1.0) * 12.0 + 0.5) / 12.0;
	return mix(value, banded, 0.58);
}

vec3 ModelSurfaceReflection(vec3 lightColor, vec3 normalValue, vec3 tangentValue,
	vec3 bitangentValue, vec3 viewDirection, vec3 lightDirection,
	float strength, vec3 fastResponse, vec3 detailedResponse, float normalView, float viewMask)
{
	if (strength <= 0.0 || all(lessThanEqual(lightColor, vec3(0.0)))) return vec3(0.0);
	if (u_fastSpecular != 0)
		return FastSurfaceReflection(lightColor, normalValue, viewDirection,
			lightDirection, fastResponse, strength);
	return BeckmannReflection(lightColor, normalValue, tangentValue, bitangentValue,
		viewDirection, lightDirection, detailedResponse, normalView, viewMask, strength);
}

float WoundRegion(int index)
{
	vec4 regionSet = woundRegions[index / 4];
	int component = index % 4;
	if (component == 0) return regionSet.x;
	if (component == 1) return regionSet.y;
	if (component == 2) return regionSet.z;
	return regionSet.w;
}

void ApplyWounds(inout vec3 albedo, inout float specularLevel,
	inout float smoothness, vec3 woundPosition)
{
	for (int woundIndex = 0; woundIndex < WOUND_COUNT; ++woundIndex)
	{
		vec4 wound = woundSpheres[woundIndex];
		// Wounds are packed from the front, so an empty slot means the rest are
		// empty too. This keeps unwounded and lightly wounded bodies inexpensive.
		if (wound.w <= 0.0) break;
		float woundRegion = WoundRegion(woundIndex);
		if (bodyRegion >= 0.0 && woundRegion >= 0.0 &&
			abs(bodyRegion - woundRegion) > 0.25) continue;
		vec3 woundOffset = woundPosition - wound.xyz;
		float inverseRadius = 1.0 / max(wound.w, 0.001);
		float radialDistanceSquared = dot(woundOffset, woundOffset) *
			inverseRadius * inverseRadius;
		// The irregular edge can shrink distance by at most 12%, so fragments
		// outside this bound cannot possibly be touched by the wound.
		if (radialDistanceSquared >= 1.292) continue;
		float radialDistance = sqrt(radialDistanceSquared);
		float irregularity = 0.94 + 0.06 * sin(dot(woundOffset,
			vec3(83.0, 57.0, 71.0)) * inverseRadius);
		radialDistance *= irregularity;
		if (radialDistance >= 1.0) continue;
		float tornEdge = 1.0 - smoothstep(0.70, 1.0, radialDistance);
		float deepCavity = 1.0 - smoothstep(0.12, 0.58, radialDistance);
		albedo = mix(albedo, vec3(0.24, 0.006, 0.008), tornEdge);
		albedo = mix(albedo, vec3(0.018, 0.001, 0.001), deepCavity);
		float wetTissue = max(tornEdge * 0.82, deepCavity * 0.46);
		specularLevel = max(specularLevel, wetTissue);
		smoothness = max(smoothness, max(tornEdge * 0.88,
			deepCavity * 0.62));
	}
}

void main()
{
	vec2 authoredUv = clamp(uv, vec2(0.004), vec2(0.996));
	vec2 materialTextureSize = vec2(textureSize(u_albedo, 0));
	vec2 texelScreenOffset = S3DTexelScreenOffset(authoredUv, materialTextureSize);
	vec2 sampleUv = S3DTexelCenter(authoredUv, materialTextureSize);
	vec2 uvDx = dFdx(authoredUv);
	vec2 uvDy = dFdy(authoredUv);
	vec3 positionDx = dFdx(localPosition);
	vec3 positionDy = S3D_DFDY(localPosition);
	vec2 tangentUvDx = dFdx(uv);
	vec2 tangentUvDy = S3D_DFDY(uv);
	vec3 lightingPosition = S3DTexelValue(localPosition, texelScreenOffset);
	vec3 geometricNormal = normalize(S3DTexelValue(surfaceNormal, texelScreenOffset));
	vec3 woundPosition = S3DTexelValue(bodyPosition, texelScreenOffset);
	vec3 albedo = textureGrad(u_albedo, sampleUv, uvDx, uvDy).rgb;
	vec3 mappedNormal = textureGrad(u_normalMap, sampleUv, uvDx, uvDy).xyz * 2.0 - 1.0;
	float specularLevel = textureGrad(u_specularMap, sampleUv, uvDx, uvDy).r;
	float smoothness = textureGrad(u_smoothnessMap, sampleUv, uvDx, uvDy).r;
	// Build the frame before divergent wound branches; derivatives need complete quads.
	mat3 surfaceFrame = CotangentFrame(geometricNormal, positionDx, positionDy, tangentUvDx, tangentUvDy);
	ApplyWounds(albedo, specularLevel, smoothness, woundPosition);
	mappedNormal.y = -mappedNormal.y;
	mappedNormal.xy *= 2.25 * u_normalStrength;
	mappedNormal = normalize(mappedNormal);
	vec3 N = normalize(mix(geometricNormal,
		normalize(surfaceFrame * mappedNormal), 0.92));
	vec3 viewDirection = normalize(-lightingPosition);
	N = SurfaceViewNormal(geometricNormal, N, viewDirection);
	float normalView = max(dot(N, viewDirection), 0.0);
	vec3 fastResponse = u_fastSpecular != 0 ?
		FastReflectionParameters(specularLevel, smoothness) : vec3(0.0);
	vec3 detailedResponse = u_fastSpecular == 0 ?
		BeckmannParameters(specularLevel, smoothness) : vec3(0.0);
	float reflectance = u_fastSpecular != 0 ? fastResponse.z : detailedResponse.z;
	vec3 tangentValue = vec3(0.0), bitangentValue = vec3(0.0);
	float viewMask = 1.0;
	if (u_fastSpecular == 0 && u_specularStrength > 0.0)
	{
		mat3 specularFrame = SurfaceSpecularFrame(N, surfaceFrame[0]);
		tangentValue = specularFrame[0];
		bitangentValue = specularFrame[1];
		viewMask += BeckmannLambda(viewDirection, tangentValue, bitangentValue, detailedResponse, normalView);
	}
	float roughness = SurfaceRoughness(smoothness);
	vec3 diffuseParameters = RelayDiffuseParameters(roughness, reflectance, u_specularStrength);
	vec3 worldUp = normalize(u_worldUp);
	float hemisphere = dot(N, worldUp) * 0.5 + 0.5;
	vec3 ambientField = vec3(0.045, 0.052, 0.072) +
		vec3(0.10, 0.12, 0.17) * hemisphere;

	vec3 sunDirection = normalize(u_sunDirection);
	vec3 sunColor = vec3(0.20, 0.18, 0.15);
	float sunDiffuse = PixelLightResponse(
		RelayDiffuse(N, viewDirection, sunDirection, diffuseParameters, normalView));
	vec3 directDiffuse = albedo * sunColor * sunDiffuse;
	vec3 directReflection = ModelSurfaceReflection(sunColor, N, tangentValue,
		bitangentValue, viewDirection, sunDirection, u_specularStrength, fastResponse,
		detailedResponse, normalView, viewMask);
	vec3 reflectionDirection = reflect(-viewDirection, N);
	float reflectedSky = dot(reflectionDirection, worldUp) * 0.5 + 0.5;
	vec3 environmentField = mix(u_environmentColor * 0.55,
		vec3(0.30, 0.39, 0.52), reflectedSky);

	for (int lightIndex = 0; lightIndex < u_lightCount; ++lightIndex)
	{
		vec4 lightParameters = ModelLightParameters(lightIndex);
		vec3 toLight = ModelLightPosition(lightIndex) - lightingPosition;
		float radius = lightParameters.x;
		float distanceSquared = dot(toLight, toLight);
		if (radius <= 0.0 || distanceSquared >= radius * radius) continue;
		float distanceToLight = sqrt(distanceSquared);
		vec3 lightColor = ModelLightColor(lightIndex);
		vec3 lightDirection = toLight / max(distanceToLight, 0.001);
		float falloff = 1.0 - distanceToLight / radius;
		float attenuation = falloff * falloff * lightParameters.y;
		float style = lightParameters.z;
		if (style > 0.5 && style < 2.5)
		{
			vec3 fromLight = -lightDirection;
			float coneCosine = lightParameters.w;
			float spot = smoothstep(coneCosine, min(coneCosine + 0.18, 0.995),
				dot(fromLight, normalize(ModelLightDirection(lightIndex))));
			attenuation *= spot;
		}
		if (attenuation == 0.0) continue;
		float diffuseResponse = PixelLightResponse(
			RelayDiffuse(N, viewDirection, lightDirection, diffuseParameters, normalView));
		directDiffuse += albedo * lightColor * attenuation *
			diffuseResponse * 0.92;
		directReflection += ModelSurfaceReflection(
			lightColor * attenuation, N, tangentValue, bitangentValue,
			viewDirection, lightDirection, u_specularStrength, fastResponse,
			detailedResponse, normalView, viewMask);
	}

	vec3 reflectedLight = CompressSurfaceReflection(directReflection + EnvironmentReflection(environmentField,
		normalView, reflectance, smoothness, u_specularStrength));
	vec3 color = albedo * ambientField * 1.62 + directDiffuse * 1.62 + reflectedLight;
	FragColor = vec4(color, u_opacity);
}
