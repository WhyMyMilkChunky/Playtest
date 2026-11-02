#ifndef S3D_GAME_FOG_GLSL
#define S3D_GAME_FOG_GLSL

#include "s3d_backend.glsl"

layout(std140) S3D_RESOURCE(0, 0) uniform FogFrame
{
	mat4 inverseViewProjection;
	vec4 cameraDistance;
	vec4 countsTime;
	vec4 densityProfile;
	vec4 ambientDirection;
	vec4 projectionSize;
	vec4 flashlight;
	vec4 volumeMinimum[20];
	vec4 volumeMaximum[20];
}
fogFrame;

S3D_RESOURCE(0, 8) uniform sampler2D u_fogDepth;
S3D_RESOURCE(0, 9) uniform sampler2DArray u_fogField;
S3D_RESOURCE(0, 10) uniform sampler2DArray u_fogDirection;

float FogViewDepth(float depth)
{
	return abs(fogFrame.projectionSize.y / min(depth * 2.0 - 1.0 + fogFrame.projectionSize.x, -0.00001));
}

float FogOpacity(float opticalDepth)
{
	float tau = max(opticalDepth, 0.0);
	// subtraction near one was throwing away the faint haze before it reached the half-float target.
	return tau < 0.01 ? tau * (1.0 - tau * 0.5 + tau * tau / 6.0) : 1.0 - exp(-tau);
}

float FogNearIntegral(float distance)
{
	// integrate the near fade so changing sample counts doesn't change how thick the air looks.
	float x = clamp((distance - 0.8) / 3.2, 0.0, 1.0);
	return 3.2 * x * x * x * (1.0 - 0.5 * x) + max(distance - 4.0, 0.0);
}

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
	if (fraction == 0.0) return first;
	return mix(first, textureLod(field, vec3(address, baseLayer + min(lower + 1.0, 5.0)), 0.0), fraction);
}

float FogHeightDensity(float height)
{
	if (fogFrame.densityProfile.y == 2.0) return 0.78 + 0.42 * exp(-max(height, 0.0) * 0.32);
	if (fogFrame.densityProfile.y == 1.0) return 1.0 + 0.18 * smoothstep(2.0, 12.0, height);
	return 1.0;
}

vec3 FogRayDirection(vec2 address)
{
	vec4 point = fogFrame.inverseViewProjection * vec4(address * 2.0 - 1.0, 0.0, 1.0);
	return normalize(point.xyz - fogFrame.cameraDistance.xyz * point.w);
}

vec3 FogRadiance(vec3 color)
{
	vec3 positive = max(color, vec3(0.0));
	float peak = max(positive.r, max(positive.g, positive.b));
	return positive / (1.0 + peak * 0.12);
}

vec3 FogAtmosphereColor()
{
	vec3 theme = fogFrame.ambientDirection.xyz;
	float luminance = dot(theme, vec3(0.2126, 0.7152, 0.0722));
	return mix(vec3(luminance), theme, 0.22);
}

vec3 FogScatterTint()
{
	vec3 theme = fogFrame.ambientDirection.xyz;
	float luminance = max(dot(theme, vec3(0.2126, 0.7152, 0.0722)), 0.01);
	return mix(vec3(1.0), clamp(theme / luminance, vec3(0.5), vec3(1.5)), 0.08);
}

float FogBaseOpacity(float distance)
{
	// keep the off preset's distant air, without a hard ramp into a grey wall.
	return 0.065 * FogOpacity(max(distance - 3.0, 0.0) / 42.0);
}

float FogDither()
{
	// fixed screen-space dither avoids adding temporal shimmer to the haze.
	return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
}

#endif
