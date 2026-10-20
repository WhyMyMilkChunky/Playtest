#ifndef S3D_GAME_BRDF_GLSL
#define S3D_GAME_BRDF_GLSL

float Pow5(float value)
{
	float squared = value * value;
	return squared * squared * value;
}

float SpecularReflectance(float specularLevel)
{
	// Preserve the existing specular-map meaning; it is not a metallic map.
	return mix(0.025, 0.28, smoothstep(0.04, 0.82, specularLevel));
}

float SurfaceRoughness(float smoothness)
{
	return clamp(1.0 - smoothness, 0.12, 0.92);
}

float SurfaceFresnel(float reflectance, float cosine)
{
	return reflectance + (1.0 - reflectance) * Pow5(1.0 - clamp(cosine, 0.0, 1.0));
}

vec3 RelayDiffuseParameters(float roughness, float reflectance, float strength)
{
	float variance = roughness * roughness;
	float a = 1.0 - 0.5 * variance / (variance + 0.33);
	float b = 0.45 * variance / (variance + 0.09);
	// Reserve the base reflected energy without inferring metalness from grayscale art.
	return vec3(a, b, 1.0 - clamp(reflectance * max(strength, 0.0), 0.0, 0.9));
}

float RelayDiffuse(vec3 normalValue, vec3 viewDirection, vec3 lightDirection,
	vec3 response, float normalView)
{
	float normalLight = max(dot(normalValue, lightDirection), 0.0);
	if (normalLight <= 0.0 || normalView <= 0.0) return 0.0;
	// Oren-Nayar rough diffuse, evaluated without angles or trigonometry.
	float alignedSlopes = max(dot(lightDirection, viewDirection) - normalLight * normalView, 0.0);
	float roughReturn = alignedSlopes / max(max(normalLight, normalView), 0.001);
	// Light intensities retain their legacy scale (the Lambert 1/pi is absorbed there).
	return normalLight * (response.x + response.y * roughReturn) * response.z;
}

vec3 BeckmannParameters(float specularLevel, float smoothness)
{
	float roughness = SurfaceRoughness(smoothness);
	return vec3(max(roughness * 0.72, 0.075), max(roughness * 1.28, 0.105),
		SpecularReflectance(specularLevel));
}

float BeckmannLambda(vec3 direction, vec3 tangentValue, vec3 bitangentValue,
	vec3 response, float normalDirection)
{
	vec2 slopes = vec2(dot(direction, tangentValue), dot(direction, bitangentValue)) * response.xy;
	float slopeSquared = dot(slopes, slopes);
	// Smith's Beckmann rational approximation is zero above a = 1.6.
	if (normalDirection * normalDirection >= 2.56 * slopeSquared) return 0.0;
	float a = max(normalDirection, 0.000001) * inversesqrt(max(slopeSquared, 1e-12));
	float aSquared = a * a;
	return max(1.0 - 1.259 * a + 0.396 * aSquared, 0.0) /
		max(3.535 * a + 2.181 * aSquared, 0.000001);
}

vec3 BeckmannReflection(vec3 lightColor, vec3 normalValue, vec3 tangentValue,
	vec3 bitangentValue, vec3 viewDirection, vec3 lightDirection,
	vec3 response, float normalView, float viewMask, float strength)
{
	float normalLight = max(dot(normalValue, lightDirection), 0.0);
	if (normalLight <= 0.0 || normalView <= 0.0 || strength <= 0.0) return vec3(0.0);
	vec3 halfway = viewDirection + lightDirection;
	halfway *= inversesqrt(max(dot(halfway, halfway), 1e-12));
	float normalHalf = max(dot(normalValue, halfway), 0.001);
	vec2 slopes = vec2(dot(halfway, tangentValue), dot(halfway, bitangentValue)) / response.xy;
	float normalHalf2 = normalHalf * normalHalf;
	float distribution = exp(-dot(slopes, slopes) / normalHalf2) /
		(3.14159265 * response.x * response.y * normalHalf2 * normalHalf2);
	float geometry = 1.0 / (viewMask + BeckmannLambda(lightDirection,
		tangentValue, bitangentValue, response, normalLight));
	float fresnel = SurfaceFresnel(response.z, dot(viewDirection, halfway));
	// The incident cosine cancels NdotL in the microfacet denominator.
	float energy = distribution * geometry * fresnel / max(4.0 * normalView, 0.000001);
	return lightColor * (energy * strength * 1.25);
}

vec3 EnvironmentReflection(vec3 environmentColor, float normalView,
	float reflectance, float smoothness, float strength)
{
	return environmentColor * SurfaceFresnel(reflectance, normalView) *
		mix(0.24, 0.72, smoothness) * max(strength, 0.0);
}

vec3 CompressSurfaceReflection(vec3 reflection)
{
	// Keep the existing LDR highlight budget, without a flat component-wise ceiling.
	float peak = max(reflection.r, max(reflection.g, reflection.b));
	if (peak <= 0.42) return reflection;
	float excess = peak - 0.42;
	float compressedPeak = 0.42 + 0.30 * excess / (excess + 0.30);
	return reflection * (compressedPeak / peak);
}

#endif
