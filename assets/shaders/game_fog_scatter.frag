#version 460 core

#include "include/game_fog.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
S3D_RESOURCE(0, 9) uniform sampler2DArray u_fogField;
S3D_RESOURCE(0, 10) uniform sampler2DArray u_fogDirection;
S3D_RESOURCE(0, 11) uniform sampler2DArray u_fogNoise;

bool ContainsFogVolume(int index, vec3 point)
{
	return all(greaterThanEqual(point, fogFrame.volumeMinimum[index].xyz)) &&
		all(lessThanEqual(point, fogFrame.volumeMaximum[index].xyz));
}

int FindFogVolume(vec3 point, int previous)
{
	if (previous >= 0 && ContainsFogVolume(previous, point)) return previous;
	for (int index = 0; index < int(fogFrame.countsTime.y); ++index)
		if (ContainsFogVolume(index, point)) return index;
	return -1;
}

vec4 SampleFogField(sampler2DArray field, vec3 coordinate, float baseLayer)
{
	vec3 cell = clamp(coordinate * 6.0 - 0.5, vec3(0.0), vec3(5.0));
	float lower = floor(cell.z);
	vec2 address = (cell.xy + 0.5) / 6.0;
	vec4 first = textureLod(field, vec3(address, baseLayer + lower), 0.0);
	float fraction = fract(cell.z);
	// Clamped volume borders use one slice, so a second fetch adds no information.
	if (fraction == 0.0) return first;
	return mix(first, textureLod(field, vec3(address, baseLayer + min(lower + 1.0, 5.0)), 0.0), fraction);
}

vec4 NoiseVolume(vec3 point)
{
	vec3 address = fract(point);
	float slice = address.z * 16.0 - 0.5;
	float lower = floor(slice);
	return mix(textureLod(u_fogNoise, vec3(address.xy, mod(lower, 16.0)), 0.0),
		textureLod(u_fogNoise, vec3(address.xy, mod(lower + 1.0, 16.0)), 0.0), fract(slice));
}

vec3 WarpFogPoint(vec3 point, float time)
{
	// A slower, periodic vector field moves relative to the main wind, reshaping
	// the pockets. Its bounded displacement keeps the overall flow recognizable.
	vec3 warpAddress = point * 0.0375 + vec3(0.004, 0.006, -0.005) * time;
	vec3 bend = NoiseVolume(warpAddress).gba * 2.0 - 1.0;
	return point + bend * 0.65;
}

float MovingDensity(vec3 point, float localHeight, float segmentLength)
{
	float time = fogFrame.countsTime.z;
	bool foundry = fogFrame.densityProfile.y == 1.0;
	bool cryo = fogFrame.densityProfile.y == 2.0;
	vec3 velocity = foundry ? vec3(0.14, 0.40, 0.06) :
		(cryo ? vec3(0.18, 0.0, 0.08) : vec3(0.22, 0.015, 0.10));
	// Advect both scales in world space so their features travel in the same direction.
	vec3 advectedPoint = point - velocity * time;
	vec3 warpedPoint = WarpFogPoint(advectedPoint, time);
	float noise = NoiseVolume(warpedPoint * 0.075).r;
	if (fogFrame.countsTime.w > 1.0)
		noise = noise * 0.75 + NoiseVolume(warpedPoint * 0.15).r * 0.25;
	// Keep a positive haze floor; noise only varies local density by at most 15 percent.
	float variation = mix(0.85, 1.15, smoothstep(0.30, 0.70, clamp(noise, 0.0, 1.0)));
	// Long integration segments average fine density variation instead of aliasing it.
	float density = mix(1.0, variation, 1.0 / (1.0 + max(segmentLength, 0.0) * 0.20));
	if (cryo) density *= 0.55 + 0.65 * exp(-localHeight * 0.24);
	return max(density, 0.0);
}

vec3 FogIllumination(vec3 ray, float travel, vec3 coordinate, float layer, vec3 lightColor,
	vec3 scatterTint, float flashlightCone)
{
	float phase = 0.8;
	if (fogFrame.densityProfile.w > 0.0)
	{
		vec4 direction = SampleFogField(u_fogDirection, coordinate, layer);
		float alignment = max(dot(ray, direction.xyz), 0.0);
		phase += direction.w * alignment * alignment * 1.4;
	}
	vec3 illumination = fogFrame.ambientDirection.xyz * 0.35 + min(lightColor, vec3(4.0)) * phase;
	if (fogFrame.flashlight.w > 0.0 && travel < 18.0)
	{
		float edge = max(1.0 - travel * travel / 324.0, 0.0);
		illumination += vec3(0.65, 0.75, 0.90) * flashlightCone * edge * edge * 2.2;
	}
	return illumination * scatterTint;
}

void ScatterSegment(vec3 ray, float lower, float upper, float phase, vec3 scatterTint, float flashlightCone,
	inout int volume, inout vec3 scattered, inout float transmission)
{
	float travel = mix(lower, upper, phase);
	vec3 point = fogFrame.cameraDistance.xyz + ray * travel;
	volume = FindFogVolume(point, volume);
	if (volume < 0) return;
	vec3 minimum = fogFrame.volumeMinimum[volume].xyz;
	vec3 coordinate = (point - minimum) / max(fogFrame.volumeMaximum[volume].xyz - minimum, vec3(0.1));
	float layer = fogFrame.volumeMinimum[volume].w;
	vec4 field = SampleFogField(u_fogField, coordinate, layer);
	float density = fogFrame.densityProfile.x * fogFrame.volumeMaximum[volume].w * field.a;
	float segmentLength = max(upper - lower, 0.0);
	if (density <= 0.0 || segmentLength <= 0.0 || travel <= 0.6) return;
	density *= MovingDensity(point, point.y - minimum.y, segmentLength) * smoothstep(0.6, 3.0, travel);
	density = max(density * fogFrame.densityProfile.z, 0.0);
	float segmentTransmission = exp(-density * segmentLength);
	scattered += transmission * (1.0 - segmentTransmission) *
		FogIllumination(ray, travel, coordinate, layer, field.rgb, scatterTint, flashlightCone);
	transmission *= segmentTransmission;
}

void main()
{
	float depth = texture(u_fogDepth, uv).r;
	vec4 endpoint = fogFrame.inverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
	vec3 offset = endpoint.xyz / max(endpoint.w, 0.00001) - fogFrame.cameraDistance.xyz;
	float rayLength = length(offset);
	if (rayLength < 0.0001) { FragColor = vec4(0.0); return; }
	float distance = min(rayLength, fogFrame.cameraDistance.w);
	vec3 ray = offset / rayLength;
	vec3 scatterTint = FogScatterTint();
	float flashlightCone = fogFrame.flashlight.w > 0.0 ?
		smoothstep(0.86, 0.97, dot(ray, fogFrame.flashlight.xyz)) : 0.0;
	int count = clamp(int(fogFrame.countsTime.x), 1, 16), volume = -1;
	vec3 scattered = vec3(0.0);
	float transmission = 1.0, phase = 0.40 + FogDither() * 0.20;
	for (int index = 0; index < count; ++index)
	{
		float start = float(index) / float(count), end = float(index + 1) / float(count);
		// Fixed distance bins prevent geometry depth changes from moving every sample.
		float lower = start * start * fogFrame.cameraDistance.w;
		if (lower >= distance) break;
		float upper = min(end * end * fogFrame.cameraDistance.w, distance);
		ScatterSegment(ray, lower, upper, phase, scatterTint, flashlightCone, volume, scattered, transmission);
	}
	// Store opacity: half floats retain much more precision near zero than near one.
	FragColor = vec4(scattered, clamp(1.0 - transmission, 0.0, 1.0));
}
