#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) out vec4 FragColor;
layout(location = 0) in vec2 uv;

struct S3DScopeLight
{
	vec4 position;
	vec4 color;
	vec4 direction;
	vec4 parameters;
};
#if defined(S3D_VULKAN)
layout(set = 0, binding = 0, std140)
#else
layout(binding = 0, std140)
#endif
uniform ScopeFrameBlock
{
	vec4 centerViewport;
	vec4 radiusReliefMagnificationAmount;
	vec4 eyeOffsetLightCount;
	vec4 sunDirection;
	vec4 worldUp;
	vec4 environmentColor;
	S3DScopeLight lights[24];
} scopeFrame;
S3D_RESOURCE(0, 1) uniform sampler2D u_scene;
#define u_centerUv scopeFrame.centerViewport.xy
#define u_viewportSize scopeFrame.centerViewport.zw
#define u_scopeRadius scopeFrame.radiusReliefMagnificationAmount.x
#define u_eyeReliefError scopeFrame.radiusReliefMagnificationAmount.y
#define u_magnification scopeFrame.radiusReliefMagnificationAmount.z
#define u_amount scopeFrame.radiusReliefMagnificationAmount.w
#define u_eyeOffset scopeFrame.eyeOffsetLightCount.xy
#define u_lightCount int(scopeFrame.eyeOffsetLightCount.z)
#define u_sunDirection scopeFrame.sunDirection.xyz
#define u_worldUp scopeFrame.worldUp.xyz
#define u_environmentColor scopeFrame.environmentColor.xyz

vec3 ScopeLightPosition(int index)
{
	return scopeFrame.lights[index].position.xyz;
}

vec3 ScopeLightColor(int index)
{
	return scopeFrame.lights[index].color.xyz;
}

vec3 ScopeLightDirection(int index)
{
	return scopeFrame.lights[index].direction.xyz;
}

vec4 ScopeLightParameters(int index)
{
	return scopeFrame.lights[index].parameters;
}

float Pow5(float value)
{
	float squared = value * value;
	return squared * squared * value;
}

float LightAttenuation(int lightIndex)
{
	vec3 toLight = ScopeLightPosition(lightIndex);
	vec4 parameters = ScopeLightParameters(lightIndex);
	float radius = parameters.x;
	float distanceSquared = dot(toLight, toLight);
	if (radius <= 0.0 || distanceSquared >= radius * radius) return 0.0;
	float distanceToLight = sqrt(distanceSquared);
	float falloff = 1.0 - distanceToLight / radius;
	float attenuation = falloff * falloff * parameters.y;
	float style = parameters.z;
	if (style > 0.5 && style < 2.5)
	{
		vec3 fromLight = -toLight / max(distanceToLight, 0.001);
		float coneCosine = parameters.w;
		float spot = smoothstep(coneCosine, min(coneCosine + 0.18, 0.995),
			dot(fromLight, normalize(ScopeLightDirection(lightIndex))));
		attenuation *= spot;
	}
	return attenuation;
}

void main()
{
	vec4 original = texture(u_scene, S3DFramebufferUv(uv));
	if (u_amount <= 0.0)
	{
		FragColor = original;
		return;
	}
	vec2 fromCenterPixels = (uv - u_centerUv) * u_viewportSize;
	float distanceFromCenterSquared = dot(fromCenterPixels, fromCenterPixels);
	float outerRadius = u_scopeRadius + 1.0;
	if (outerRadius <= 0.0 ||
		distanceFromCenterSquared >= outerRadius * outerRadius)
	{
		FragColor = original;
		return;
	}
	float distanceFromCenter = sqrt(distanceFromCenterSquared);
	float lensMask = 1.0 - smoothstep(u_scopeRadius - 2.5,
		u_scopeRadius + 1.0, distanceFromCenter);
	if (lensMask <= 0.0)
	{
		FragColor = original;
		return;
	}

	float radius = clamp(distanceFromCenter / u_scopeRadius, 0.0, 1.0);
	vec2 radialDirection = distanceFromCenter > 0.001 ?
		fromCenterPixels / distanceFromCenter : vec2(0.0);
	float curvedGlass = radius * radius;
	float zoom = 1.0 + (u_magnification - 1.0) *
		(1.0 + (1.0 - curvedGlass) * 0.22);
	vec2 sampleUv = u_centerUv + (uv - u_centerUv) / zoom;
	// Refraction and color separation grow toward the curved outer glass.
	sampleUv += radialDirection * (curvedGlass * curvedGlass * 4.2) / u_viewportSize;
	float radialBlurPixels = mix(0.20, 5.8,
		smoothstep(0.14, 1.0, radius) * curvedGlass);
	radialBlurPixels *= 1.0 + u_eyeReliefError * 0.22;
	vec2 radialStep = radialDirection * radialBlurPixels / u_viewportSize;
	vec3 radialColor = texture(u_scene, S3DFramebufferUv(sampleUv)).rgb * 0.34;
	radialColor += texture(u_scene,
		S3DFramebufferUv(sampleUv + radialStep * 0.72)).rgb * 0.22;
	radialColor += texture(u_scene,
		S3DFramebufferUv(sampleUv - radialStep * 0.72)).rgb * 0.22;
	radialColor += texture(u_scene,
		S3DFramebufferUv(sampleUv + radialStep * 1.65)).rgb * 0.11;
	radialColor += texture(u_scene,
		S3DFramebufferUv(sampleUv - radialStep * 1.65)).rgb * 0.11;
	vec2 chromaticOffset = radialDirection * (curvedGlass * 1.65) / u_viewportSize;
	vec3 separatedColor = radialColor;
	separatedColor.r = texture(u_scene,
		S3DFramebufferUv(sampleUv + chromaticOffset)).r;
	separatedColor.b = texture(u_scene,
		S3DFramebufferUv(sampleUv - chromaticOffset)).b;
	vec3 glassColor = mix(radialColor, separatedColor,
		0.28 + curvedGlass * 0.52);
	glassColor *= 1.0 - curvedGlass * curvedGlass * 0.20;
	glassColor *= vec3(0.94, 1.025, 1.045);
	float reflection = pow(max(dot(radialDirection, normalize(vec2(-0.65, 0.76))), 0.0),
		7.0) * curvedGlass * 0.12;
	float rimLight = smoothstep(0.72, 1.0, radius) *
		(0.025 + max(radialDirection.y, 0.0) * 0.035);
	glassColor += vec3(0.38, 0.72, 0.84) * (reflection + rimLight);

	// Treat the overlay as a shallow curved, coated lens. World lights produce
	// tight colored highlights while Fresnel adds the broader optical reflection.
	vec2 lensCoordinate = fromCenterPixels / u_scopeRadius;
	// A real scope only presents a full image while the eye remains inside its
	// exit pupil. Misalignment shifts this soft aperture and creates scope shadow.
	vec2 exitPupilCenter = u_eyeOffset * 4.4;
	float lateralError = length(u_eyeOffset);
	float shadowStrength = clamp(
		smoothstep(0.004, 0.075, lateralError) + u_eyeReliefError * 0.72,
		0.0, 1.0);
	float exitPupilRadius = 1.10 - min(
		lateralError * 2.2 + u_eyeReliefError * 0.22, 0.42);
	float exitPupilFeather = 0.10 + lateralError * 0.75 +
		u_eyeReliefError * 0.055;
	float exitPupil = 1.0 - smoothstep(
		exitPupilRadius - exitPupilFeather,
		exitPupilRadius + exitPupilFeather,
		length(lensCoordinate - exitPupilCenter));
	float scopeShadow = (1.0 - exitPupil) * shadowStrength;
	vec2 lensSlope = lensCoordinate * 0.72;
	vec3 lensNormal = normalize(vec3(lensSlope,
		sqrt(max(1.0 - dot(lensSlope, lensSlope), 0.001))));
	vec3 viewDirection = vec3(0.0, 0.0, 1.0);
	float normalView = max(dot(lensNormal, viewDirection), 0.0);
	float fresnel = 0.035 + 0.965 * Pow5(1.0 - normalView);
	vec3 skyDirection = normalize(vec3(u_worldUp.xy, abs(u_worldUp.z) + 0.35));
	float skyFacing = max(dot(lensNormal, skyDirection), 0.0);
	vec3 coatingReflection = mix(u_environmentColor * 0.45,
		vec3(0.24, 0.34, 0.46), skyFacing) * fresnel * 0.38;
	vec3 sunDirection = normalize(vec3(u_sunDirection.xy,
		abs(u_sunDirection.z) + 0.12));
	vec3 sunHalfway = normalize(viewDirection + sunDirection);
	coatingReflection += vec3(0.20, 0.18, 0.15) *
		pow(max(dot(lensNormal, sunHalfway), 0.0), 76.0) * 0.32;
	for (int lightIndex = 0; lightIndex < u_lightCount; ++lightIndex)
	{
		float attenuation = LightAttenuation(lightIndex);
		if (attenuation <= 0.0) continue;
		vec3 lightPosition = ScopeLightPosition(lightIndex);
		vec3 highlightDirection = normalize(vec3(lightPosition.xy,
			abs(lightPosition.z) + 0.12));
		vec3 halfway = normalize(viewDirection + highlightDirection);
		float highlight = pow(max(dot(lensNormal, halfway), 0.0), 92.0);
		coatingReflection += ScopeLightColor(lightIndex) * attenuation *
			highlight * (0.18 + fresnel * 0.34);
	}
	glassColor += min(coatingReflection, vec3(0.48));
	glassColor = mix(glassColor, vec3(0.0015, 0.0020, 0.0024),
		clamp(scopeShadow * 1.08, 0.0, 0.985));

	float blend = lensMask * smoothstep(0.0, 1.0, u_amount);
	FragColor = vec4(mix(original.rgb, glassColor, blend), original.a);
}
