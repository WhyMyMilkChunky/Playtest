#ifndef S3D_GAME_FACET_RELAY_GLSL
#define S3D_GAME_FACET_RELAY_GLSL

#include "game_brdf.glsl"

// Experimental appearance response: coarse-surface transport and mapped facets
// share a reflected-direction footprint. This is not a validated physical BRDF.
struct FacetRelayParameters
{
	// Broad precision, additional tangent precision, lobe gain, diffuse scatter.
	vec4 angular;
	// Reserved, specular strength, view visibility, unresolved relay weight.
	vec4 transport;
	// Shoulder precision/gain, shoulder energy share, geometry masking.
	vec4 finish;
	// Material reflectance color; the fourth component is unused.
	vec4 optics;
};

float FacetRelayRoughness(float smoothness)
{
	// Smoothness is perceptual. Preserve polished and wet finishes below 0.12.
	return clamp(1.0 - smoothness, 0.035, 0.96);
}

FacetRelayParameters PrepareFacetRelay(vec3 geometricNormal, vec3 shadingNormal,
	vec3 viewDirection, float roughness, vec3 reflectance, float strength, bool detailed, float anisotropy)
{
	float variance = roughness * roughness;
	float width = 0.024 + 1.05 * variance;
	float brushing = detailed ? clamp(anisotropy, 0.0, 0.7) : 0.0;
	vec2 inverseWidth = 1.0 / (width * vec2(1.0 - 0.55 * brushing, 1.0 + 0.8 * brushing));
	float disagreement = clamp(1.0 - dot(geometricNormal, shadingNormal), 0.0, 1.0);
	float coarseView = max(dot(geometricNormal, viewDirection), 0.0);
	float masking = 0.02 + 0.22 * variance;
	float viewVisibility = coarseView / max(coarseView + masking * (1.0 - coarseView), 0.0001);
	// Projected-area compensation retains grazing glints without a singular 1/NV.
	viewVisibility /= 0.5 + 0.5 * max(dot(shadingNormal, viewDirection), 0.0);
	float shoulderWidth = 0.18 + 0.75 * roughness;
	float shoulderPrecision = 1.0 / (shoulderWidth * shoulderWidth);
	FacetRelayParameters response;
	// The planar integral of 1/(1+q+q*q/2) is pi*pi/2. Its spherical use
	// here is an approximation; the gain retains the existing light calibration.
	response.angular = vec4(inverseWidth.y * inverseWidth.y,
		inverseWidth.x * inverseWidth.x - inverseWidth.y * inverseWidth.y,
		0.202642367 * inverseWidth.x * inverseWidth.y * 1.25,
		clamp(variance * 0.55 + disagreement * (0.25 + 0.75 * roughness) * 0.35, 0.0, 0.75));
	response.transport = vec4(0.0, max(strength, 0.0), viewVisibility,
		disagreement * (0.05 + 0.15 * roughness));
	response.finish = vec4(shoulderPrecision, 0.253302959 * shoulderPrecision,
		detailed ? clamp(0.025 + 0.16 * variance + disagreement * (1.0 - roughness) * 0.10, 0.025, 0.26) : 0.0,
		masking);
	response.optics = vec4(clamp(reflectance, vec3(0.0), vec3(0.95)), 0.0);
	return response;
}

vec3 FacetRelayFootprint(vec3 shadingNormal, vec3 tangentValue, vec3 viewDirection,
	vec3 lightDirection, float normalLight, float sourceVariance, FacetRelayParameters response)
{
	vec3 reflectedDirection = 2.0 * normalLight * shadingNormal - lightDirection;
	vec3 error = viewDirection - reflectedDirection;
	float tangentError = dot(error, tangentValue);
	float errorSquared = dot(error, error);
	// Broaden by the emitter's angular extent and lower peak gain by the same
	// area factor. A strip stays visible without becoming a stronger point light.
	float coreFilter = 1.0 / (1.0 + sourceVariance * response.angular.z * 3.94784176);
	float q = max(errorSquared * response.angular.x +
		tangentError * tangentError * response.angular.y, 0.0) * coreFilter;
	float core = 1.0 / (1.0 + q + 0.5 * q * q);
	float shoulder = 0.0;
	if (response.finish.z > 0.0)
	{
		float shoulderFilter = 1.0 / (1.0 + sourceVariance * response.finish.x);
		float shoulderQ = errorSquared * response.finish.x * shoulderFilter;
		shoulder = response.finish.y * shoulderFilter / (1.0 + shoulderQ + 0.5 * shoulderQ * shoulderQ);
	}
	return vec3(core * response.angular.z * coreFilter, shoulder, core);
}

vec4 EvaluateFacetRelay(vec3 geometricNormal, vec3 shadingNormal, vec3 tangentValue,
	vec3 viewDirection, vec3 lightDirection, float sourceVariance, FacetRelayParameters response)
{
	float coarseLight = max(dot(geometricNormal, lightDirection), 0.0);
	if (coarseLight <= 0.0) return vec4(0.0);
	float facetLight = max(dot(shadingNormal, lightDirection), 0.0);
	vec3 footprint = vec3(0.0);
	if (facetLight > 0.0 && response.transport.y > 0.0)
		footprint = FacetRelayFootprint(shadingNormal, tangentValue, viewDirection,
			lightDirection, facetLight, sourceVariance, response);
	// The incident cosine of the light/view bisector gives Fresnel its actual
	// reflection angle, without constructing or normalizing that bisector.
	float incidentCosine = sqrt(clamp(0.5 + 0.5 * dot(viewDirection, lightDirection), 0.0, 1.0));
	vec3 reflectedBudget = clamp((response.optics.xyz + (vec3(1.0) - response.optics.xyz) *
		Pow5(1.0 - incidentCosine)) * response.transport.y, vec3(0.0), vec3(0.95));
	// Away from the directional footprint, unresolved facets relay more diffuse
	// light through the coarse surface. This softens texel-sized black cutoffs.
	float scatter = min(response.angular.w + (1.0 - footprint.z) * response.transport.w, 0.8);
	float diffuse = mix(facetLight, coarseLight, scatter) *
		(1.0 - max(reflectedBudget.r, max(reflectedBudget.g, reflectedBudget.b)));
	float lightVisibility = coarseLight / max(coarseLight + response.finish.w * (1.0 - coarseLight), 0.0001);
	vec3 specular = mix(footprint.x, footprint.y, response.finish.z) * reflectedBudget *
		response.transport.z * lightVisibility * facetLight;
	return vec4(diffuse, specular);
}

vec3 FacetRelayEnvironment(vec3 environmentColor, float normalView,
	vec3 reflectance, float roughness, float strength)
{
	vec3 grazingReflectance = mix(vec3(1.0), reflectance, roughness * roughness);
	vec3 fresnel = reflectance + (grazingReflectance - reflectance) * Pow5(1.0 - clamp(normalView, 0.0, 1.0));
	float finishReturn = mix(0.18, 0.9, smoothstep(0.1, 0.92, 1.0 - roughness));
	return environmentColor * fresnel * finishReturn * max(strength, 0.0);
}

vec3 CompressFacetRelayReflection(vec3 reflection)
{
	float peak = max(reflection.r, max(reflection.g, reflection.b));
	if (peak <= 0.65) return reflection;
	float excess = peak - 0.65;
	return reflection * (0.65 + 0.60 * excess / (excess + 0.60)) / peak;
}

#endif
