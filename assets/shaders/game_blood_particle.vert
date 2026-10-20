#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec2 aTcoord;
layout(location = 3) in vec4 aPositionAndSize;
layout(location = 4) in vec4 aColorAndSeed;
layout(location = 5) in vec4 aVelocityAndStretch;

#if defined(S3D_VULKAN)
S3D_RESOURCE(0, 0) uniform BloodParticleFrame
{
	mat4 u_viewProjection;
	vec3 u_cameraRight;
	vec3 u_cameraUp;
};
#else
uniform mat4 u_viewProjection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform mat4 u_view;
uniform int u_lightCount;
uniform vec3 u_lightPositions[24];
uniform vec3 u_lightColors[24];
uniform vec3 u_lightDirections[24];
uniform vec4 u_lightParameters[24];
uniform vec3 u_sunDirection;
#endif

layout(location = 0) out vec2 particleUv;
layout(location = 1) out vec3 particleColor;
layout(location = 2) flat out float shapeSeed;

#if !defined(S3D_VULKAN)
layout(location = 3) flat out vec3 particleView;
layout(location = 4) flat out vec3 particleAcross;
layout(location = 5) flat out vec3 particleAlong;
layout(location = 6) flat out vec4 lightDirection0;
layout(location = 7) flat out vec3 lightColor0;
layout(location = 8) flat out vec4 lightDirection1;
layout(location = 9) flat out vec3 lightColor1;
layout(location = 10) flat out vec3 lightSpill;
layout(location = 11) flat out vec3 particleDiffuse;

float LightRank(vec3 color) { return max(color.r, max(color.g, color.b)); }

void ConsiderLight(vec3 direction, vec3 color, float sourceVariance)
{
	lightSpill += color * 0.35;
	particleDiffuse += color * max(dot(particleView, direction), 0.0) * 0.92;
	float rank = LightRank(color);
	if (rank > LightRank(lightColor0))
	{
		lightColor1 = lightColor0; lightDirection1 = lightDirection0;
		lightColor0 = color; lightDirection0 = vec4(direction, sourceVariance);
	}
	else if (rank > LightRank(lightColor1))
	{
		lightColor1 = color; lightDirection1 = vec4(direction, sourceVariance);
	}
}

void PrepareBloodLights(vec3 centerView)
{
	lightColor0 = vec3(0.0); lightColor1 = vec3(0.0); lightSpill = vec3(0.0);
	particleDiffuse = vec3(0.0);
	lightDirection0 = vec4(0.0, 1.0, 0.0, 0.0); lightDirection1 = lightDirection0;
	ConsiderLight(normalize(u_sunDirection), vec3(0.20, 0.18, 0.15), 0.0);
	// Light selection runs per vertex at the drop center, never per covered pixel.
	for (int index = 0; index < u_lightCount; ++index)
	{
		vec4 parameters = u_lightParameters[index];
		vec3 delta = u_lightPositions[index] - centerView;
		float distanceSquared = dot(delta, delta), radius = parameters.x;
		if (radius <= 0.0 || distanceSquared >= radius * radius) continue;
		float distance = sqrt(max(distanceSquared, 0.000001));
		vec3 direction = delta / distance;
		float falloff = 1.0 - distance / radius;
		float attenuation = falloff * falloff * parameters.y;
		if (parameters.z > 0.5 && parameters.z < 2.5)
			attenuation *= smoothstep(parameters.w, min(parameters.w + 0.18, 0.995),
				dot(-direction, u_lightDirections[index]));
		ConsiderLight(direction, u_lightColors[index] * attenuation, min(0.16, 0.0025 / (distanceSquared + 0.001)));
	}
	lightSpill = max(lightSpill - (lightColor0 + lightColor1) * 0.35, vec3(0.0));
}
#endif

void main()
{
	vec2 projectedVelocity = vec2(dot(aVelocityAndStretch.xyz, u_cameraRight),
		dot(aVelocityAndStretch.xyz, u_cameraUp));
	float speedSquared = dot(projectedVelocity, projectedVelocity);
	vec2 along = speedSquared > 0.001 ? projectedVelocity * inversesqrt(speedSquared) : vec2(0.0, 1.0);
	vec2 across = vec2(along.y, -along.x);
	float stretch = 1.0 + min(1.6, sqrt(speedSquared) * 0.055 * aVelocityAndStretch.w);
	vec2 billboard = across * aPosition.x + along * aPosition.y * stretch;
	vec3 worldPosition = aPositionAndSize.xyz +
		(u_cameraRight * billboard.x + u_cameraUp * billboard.y) * aPositionAndSize.w;
	particleUv = aTcoord;
	particleColor = aColorAndSeed.rgb;
	shapeSeed = aColorAndSeed.w;
#if !defined(S3D_VULKAN)
	vec3 centerView = (u_view * vec4(aPositionAndSize.xyz, 1.0)).xyz;
	particleView = -centerView * inversesqrt(max(dot(centerView, centerView), 0.000001));
	particleAcross = vec3(across, 0.0);
	particleAlong = vec3(along, 0.0);
	PrepareBloodLights(centerView);
#endif
	gl_Position = S3DClipPosition(
		u_viewProjection * vec4(worldPosition, 1.0));
}
