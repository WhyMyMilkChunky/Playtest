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
} fogFrame;

S3D_RESOURCE(0, 8) uniform sampler2D u_fogDepth;

float FogViewDepth(float depth)
{
	return abs(fogFrame.projectionSize.y / min(depth * 2.0 - 1.0 + fogFrame.projectionSize.x, -0.00001));
}

vec3 FogAtmosphereColor()
{
	vec3 theme = fogFrame.ambientDirection.xyz;
	float luminance = dot(theme, vec3(0.2126, 0.7152, 0.0722));
	return mix(vec3(luminance), theme, 0.40);
}

vec3 FogScatterTint()
{
	vec3 theme = fogFrame.ambientDirection.xyz;
	float luminance = max(dot(theme, vec3(0.2126, 0.7152, 0.0722)), 0.01);
	return mix(vec3(1.0), clamp(theme / luminance, vec3(0.5), vec3(1.5)), 0.14);
}

float FogBaseOpacity(float distance)
{
	// A restrained linear haze remains when local volumetric scattering is off.
	return 0.075 * clamp((distance - 3.0) / 69.0, 0.0, 1.0);
}

float FogDither()
{
	// Static spatial dithering; no temporal jitter or history buffer.
	return fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
}

#endif
