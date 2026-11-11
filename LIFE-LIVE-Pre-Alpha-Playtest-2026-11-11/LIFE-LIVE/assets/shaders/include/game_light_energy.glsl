#ifndef S3D_GAME_LIGHT_ENERGY_GLSL
#define S3D_GAME_LIGHT_ENERGY_GLSL

const float LIGHTING_GAIN = 1.62;

vec3 MaterialLinearColor(vec3 encoded)
{
	vec3 c = clamp(encoded, vec3(0.0), vec3(1.0));
	// fitted to the engine's sRGB decode, with exact black, white and the linear toe.
	// max absolute error is below .00136; no per-fragment pow or extra texture lookup.
	vec3 curve = c * (0.05858650 + c * (0.43735749 + c * (0.69324671 - c * 0.18919070)));
	return mix(curve, c / 12.92, lessThanEqual(c, vec3(0.04045)));
}

vec3 SceneLightEnergy(vec3 encoded) { return max(encoded, vec3(0.0)) * max(encoded, vec3(0.0)); }
vec3 EncodeLightEnergy(vec3 linearColor) { return sqrt(max(linearColor, vec3(0.0))); }

vec3 FinishLightEnergy(vec3 linearColor, bool hdr)
{
	// the scene/post boundary still uses its existing gamma-2 storage convention.
	vec3 encoded = EncodeLightEnergy(linearColor);
	float peak = max(encoded.r, max(encoded.g, encoded.b));
	if (!hdr && peak > 0.75)
	{
		float excess = peak - 0.75;
		encoded *= (0.75 + 0.25 * excess / (excess + 0.25)) / peak;
	}
	return encoded;
}

vec3 BroadReflectionDirection(vec3 normalValue, vec3 reflected, float roughness)
{
	return normalize(mix(reflected, normalValue, roughness * roughness));
}

vec3 DirectionalLight(vec4 red, vec4 green, vec4 blue, vec3 direction, float width)
{
	vec4 basis = vec4(1.0, direction * width);
	return max(vec3(dot(red, basis), dot(green, basis), dot(blue, basis)), vec3(0.0));
}

float IndirectReflectionVisibility(float normalView, float occlusion, float roughness)
{
	float openness = clamp(occlusion, 0.0, 1.0);
	float gloss = (1.0 - roughness) * (1.0 - roughness);
	// contact visibility proxy, not a traced reflection. sealed cavities stay sealed.
	return clamp(openness * (1.0 + (2.0 * normalView - 1.0) * gloss * (1.0 - openness)), 0.0, 1.0);
}

float IndirectDiffuseBudget(vec3 reflectance, float strength)
{
	float f0 = max(reflectance.r, max(reflectance.g, reflectance.b));
	return 1.0 - clamp((f0 + (1.0 - f0) / 21.0) * max(strength, 0.0), 0.0, 0.95);
}

#endif
