#ifndef S3D_GAME_REFLECTION_GLSL
#define S3D_GAME_REFLECTION_GLSL

#include "game_brdf.glsl"

vec3 FastReflectionParameters(float specularLevel, float smoothness)
{
	float roughness = SurfaceRoughness(smoothness);
	float visibility = (roughness + 1.0) * (roughness + 1.0) * 0.125;
	float reflectance = SpecularReflectance(specularLevel);
	return vec3(roughness * roughness, visibility, reflectance);
}

vec3 FastSurfaceReflection(vec3 lightColor, vec3 normalValue, vec3 viewDirection,
	vec3 lightDirection, vec3 response, float strength)
{
	float normalLight = max(dot(normalValue, lightDirection), 0.0);
	float normalView = max(dot(normalValue, viewDirection), 0.0);
	if (normalLight <= 0.0 || normalView <= 0.0 || strength <= 0.0) return vec3(0.0);
	vec3 halfVector = viewDirection + lightDirection;
	halfVector *= inversesqrt(max(dot(halfVector, halfVector), 0.000001));
	float normalHalf = max(dot(normalValue, halfVector), 0.001);
	float viewHalf = clamp(dot(viewDirection, halfVector), 0.0, 1.0);
	float denominator = normalHalf * normalHalf * (response.x - 1.0) + 1.0;
	float distribution = response.x / max(3.14159265 * denominator * denominator, 0.000001);
	float viewVisibility = normalView * (1.0 - response.y) + response.y;
	float lightVisibility = normalLight * (1.0 - response.y) + response.y;
	float fresnel = SurfaceFresnel(response.z, viewHalf);
	float energy = distribution * fresnel * normalLight / (4.0 * viewVisibility * lightVisibility);
	return lightColor * (energy * strength * 1.25);
}

#endif
