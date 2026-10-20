#version 460 core

#include "include/game_blood_material.glsl"

#if !defined(S3D_VULKAN)
#include "include/game_facet_relay.glsl"

uniform vec3 u_worldUp;
uniform vec3 u_environmentColor;
uniform float u_specularStrength;
uniform int u_detailedSpecular;

layout(location = 3) flat in vec3 particleView;
layout(location = 4) flat in vec3 particleAcross;
layout(location = 5) flat in vec3 particleAlong;
layout(location = 6) flat in vec4 lightDirection0;
layout(location = 7) flat in vec3 lightColor0;
layout(location = 8) flat in vec4 lightDirection1;
layout(location = 9) flat in vec3 lightColor1;
layout(location = 10) flat in vec3 lightSpill;
layout(location = 11) flat in vec3 particleDiffuse;

vec3 FlatBloodLighting(vec3 V, vec3 albedo)
{
	vec3 ambient = vec3(0.045, 0.052, 0.072) +
		vec3(0.10, 0.12, 0.17) * (dot(V, u_worldUp) * 0.5 + 0.5);
	float retained = 1.0 - clamp((0.018 + 0.062 * BLOOD_SPECULAR_LEVEL) *
		u_specularStrength * BLOOD_REFLECTION_GAIN, 0.0, 0.95);
	return albedo * (ambient + particleDiffuse * retained) * 1.62;
}

vec3 ShadeBloodDrop(vec2 pixelPosition, vec2 footprint, vec3 color)
{
	vec3 V = normalize(particleView);
	vec3 albedo = BLOOD_BASE_COLOR * clamp(color.r / 0.52, 0.5, 1.4);
	float pixelFootprint = max(footprint.x, footprint.y);
	// Fade wet lobes out over roughly 12 to 6 pixels, avoiding a visible LOD pop.
	float detail = 1.0 - smoothstep(0.0833, 0.1667, pixelFootprint);
	if (detail <= 0.0) return FlatBloodLighting(V, albedo);
	vec3 N = normalize(V + particleAcross * pixelPosition.x * 0.6 + particleAlong * pixelPosition.y * 0.6);
	vec3 tangent = normalize(particleAcross - N * dot(particleAcross, N));
	vec3 reflectance = vec3(0.018 + 0.062 * BLOOD_SPECULAR_LEVEL);
	float roughness = max(FacetRelayRoughness(BLOOD_SMOOTHNESS),
		min(0.22, pixelFootprint * 0.45));
	float strength = u_specularStrength * BLOOD_REFLECTION_GAIN;
	FacetRelayParameters response = PrepareFacetRelay(N, N, V, roughness,
		reflectance, strength, u_detailedSpecular != 0, 0.0);
	vec4 first = EvaluateFacetRelay(N, N, tangent, V, lightDirection0.xyz, lightDirection0.w, response);
	vec4 second = EvaluateFacetRelay(N, N, tangent, V, lightDirection1.xyz, lightDirection1.w, response);
	float hemisphere = dot(N, u_worldUp) * 0.5 + 0.5;
	vec3 ambient = vec3(0.045, 0.052, 0.072) + vec3(0.10, 0.12, 0.17) * hemisphere;
	vec3 diffuse = albedo * (lightSpill + (lightColor0 * first.x + lightColor1 * second.x) * 0.92);
	float sky = dot(reflect(-V, N), u_worldUp) * 0.5 + 0.5;
	vec3 environment = mix(u_environmentColor * 0.55, vec3(0.30, 0.39, 0.52), sky);
	vec3 reflection = lightColor0 * first.yzw + lightColor1 * second.yzw +
		FacetRelayEnvironment(environment, max(dot(N, V), 0.0), reflectance, roughness, strength);
	vec3 shaded = (albedo * ambient + diffuse) * 1.62 + CompressFacetRelayReflection(reflection);
	if (detail >= 1.0) return shaded;
	return mix(FlatBloodLighting(V, albedo), shaded, detail);
}
#endif

// Cutout drops write depth only after their empty pixels have been discarded.
// Forced early tests would also write depth for those empty pixels.

layout(location = 0) in vec2 particleUv;
layout(location = 1) in vec3 particleColor;
layout(location = 2) flat in float shapeSeed;

layout(location = 0) out vec4 FragColor;

float CellNoise(vec2 cell)
{
	return fract((cell.x * 0.1031 + cell.y * 0.11369 + shapeSeed * 7.13787) *
		(cell.x + cell.y + 13.19));
}

void main()
{
#if !defined(S3D_VULKAN)
	// Derivatives must be evaluated with complete quads, before cutout discard.
	vec2 footprint = fwidth(particleUv);
#endif
	vec2 cell = floor(particleUv * 8.0);
	vec2 pixelPosition = ((cell + 0.5) / 8.0) * 2.0 - 1.0;
	vec2 scaledPosition = pixelPosition * vec2(0.88 + fract(shapeSeed * 7.31) * 0.25, 0.85);
	float radiusSquared = dot(scaledPosition, scaledPosition);
	if (radiusSquared >= 0.42 * 0.42)
	{
		if (radiusSquared >= 1.24 * 1.24) discard;
		float occupancy = CellNoise(cell);
		float occupancyMargin = occupancy - 0.20;
		bool clusteredPixel = radiusSquared < 0.98 * 0.98 && occupancyMargin > 0.0 &&
			occupancyMargin * occupancyMargin > radiusSquared * 0.35 * 0.35;
		bool satellite = radiusSquared >= 0.84 * 0.84 && occupancy > 0.90;
		if (!clusteredPixel && !satellite) discard;
	}
#if !defined(S3D_VULKAN)
	FragColor = vec4(ShadeBloodDrop(pixelPosition, footprint, particleColor), 1.0);
#else
	FragColor = vec4(particleColor, 1.0);
#endif
}
