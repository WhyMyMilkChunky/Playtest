#version 460 core

#include "include/game_fog.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
S3D_RESOURCE(0, 11) uniform sampler2DArray u_fogNoise;

vec4 NoiseVolume(vec3 point)
{
	vec3 address = fract(point);
	float slice = address.z * 16.0 - 0.5;
	float lower = floor(slice);
	return mix(textureLod(u_fogNoise, vec3(address.xy, mod(lower, 16.0)), 0.0),
	    textureLod(u_fogNoise, vec3(address.xy, mod(lower + 1.0, 16.0)), 0.0), fract(slice));
}

float MovingLightVariation(vec3 point, float segmentLength)
{
	float time = fogFrame.countsTime.z;
	bool foundry = fogFrame.densityProfile.y == 1.0;
	bool cryo = fogFrame.densityProfile.y == 2.0;
	vec3 velocity =
	    foundry ? vec3(0.12, 0.18, 0.05) : (cryo ? vec3(0.14, 0.0, 0.06) : vec3(0.16, 0.012, 0.07));
	vec2 noise = NoiseVolume((point - velocity * time) * 0.06).rg;
	float detail = abs(fogFrame.countsTime.w) > 1.0 ? 0.22 : 0.0;
	float variation = mix(noise.r, noise.g, detail) * 2.0 - 1.0;
	// drift belongs in the lit air, not in the silhouette of every wall behind it.
	float strength = foundry ? 0.12 : 0.07;
	return 1.0 + variation * strength / (1.0 + segmentLength * 0.2);
}

float FogPhase(vec3 ray, vec3 coordinate, float layer, float coverage)
{
	if (fogFrame.densityProfile.w <= 0.0) return 0.72;

	vec4 direction = SampleFogField(u_fogDirection, coordinate, layer);
	float directionLength = length(direction.xyz);
	float alignment = clamp(dot(ray, direction.xyz / max(directionLength, 0.0001)), -1.0, 1.0);
	float coherence = clamp(direction.w / max(coverage, 0.15), 0.0, 1.0) *
	                  clamp(directionLength / max(coverage, 0.15), 0.0, 1.0);
	// a broad forward lobe catches the fixture's light without turning it into a sharp cone.
	const float asymmetry = 0.32;
	float denominator = 1.0 + asymmetry * asymmetry - 2.0 * asymmetry * alignment;
	float forward = (1.0 - asymmetry * asymmetry) / (denominator * sqrt(denominator));
	return 0.72 * mix(1.0, forward, coherence);
}

vec3 FogIllumination(vec3 ray, float travel, vec3 coordinate, float layer, vec4 field, vec3 scatterTint,
    float flashlightCone, float variation)
{
	// solid probes carry no light. dividing out their coverage avoids dark seams at volume edges.
	vec3 lightColor = FogRadiance(field.rgb / max(field.a, 0.15));
	float phase = FogPhase(ray, coordinate, layer, field.a);
	vec3 illumination = fogFrame.ambientDirection.xyz * 0.28 + lightColor * phase * variation;
	if (fogFrame.flashlight.w > 0.0 && travel < 18.0)
	{
		float edge = max(1.0 - travel * travel / 324.0, 0.0);
		illumination += vec3(0.92, 0.96, 1.0) * flashlightCone * edge * edge * variation * 1.35;
	}
	return illumination * scatterTint;
}

void ScatterSegment(vec3 ray, float lower, float upper, float phase, vec3 scatterTint, float flashlightCone,
    inout int volume, inout vec3 scattered, inout float opacity)
{
	float exposure = FogNearIntegral(upper) - FogNearIntegral(lower);
	if (exposure <= 0.0) return;

	float travel = mix(lower, upper, phase);
	vec3 point = fogFrame.cameraDistance.xyz + ray * travel;
	volume = FindFogVolume(point, volume);
	if (volume < 0) return;
	vec3 minimum = fogFrame.volumeMinimum[volume].xyz;
	vec3 coordinate = (point - minimum) / max(fogFrame.volumeMaximum[volume].xyz - minimum, vec3(0.1));
	float layer = fogFrame.volumeMinimum[volume].w;
	vec4 field = SampleFogField(u_fogField, coordinate, layer);
	float density = fogFrame.densityProfile.x * fogFrame.volumeMaximum[volume].w * field.a;
	if (density <= 0.0) return;

	density *= FogHeightDensity(point.y - minimum.y) * fogFrame.densityProfile.z;
	float contribution = (1.0 - opacity) * FogOpacity(density * exposure);
	float variation = MovingLightVariation(point, upper - lower);
	scattered += contribution * FogIllumination(ray, travel, coordinate, layer, field, scatterTint,
	                                flashlightCone, variation);
	opacity += contribution;
}

void main()
{
	float depth = texture(u_fogDepth, S3DFramebufferUv(uv)).r;
	vec4 endpoint = fogFrame.inverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
	vec3 offset = endpoint.xyz / max(endpoint.w, 0.00001) - fogFrame.cameraDistance.xyz;
	float rayLength = length(offset);
	if (rayLength < 0.0001)
	{
		FragColor = vec4(0.0);
		return;
	}
	float distance = min(rayLength, fogFrame.cameraDistance.w);
	vec3 ray = offset / rayLength;
	vec3 scatterTint = FogScatterTint();
	float flashlightCone =
	    fogFrame.flashlight.w > 0.0 ? smoothstep(0.86, 0.97, dot(ray, fogFrame.flashlight.xyz)) : 0.0;
	int count = clamp(int(fogFrame.countsTime.x), 1, 16), volume = -1;
	vec3 scattered = vec3(0.0);
	float opacity = 0.0, phase = 0.46 + FogDither() * 0.08;
	for (int index = 0; index < count; ++index)
	{
		float start = float(index) / float(count), end = float(index + 1) / float(count);
		// fixed distance bins keep geometry depth changes from moving every sample.
		float lower = start * start * fogFrame.cameraDistance.w;
		if (lower >= distance) break;
		float upper = min(end * end * fogFrame.cameraDistance.w, distance);
		ScatterSegment(ray, lower, upper, phase, scatterTint, flashlightCone, volume, scattered, opacity);
	}
	// accumulate opacity directly so faint haze survives the half-float target.
	FragColor = vec4(scattered, clamp(opacity, 0.0, 1.0));
}
