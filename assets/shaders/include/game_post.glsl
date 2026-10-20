#ifndef GAME_POST_GLSL
#define GAME_POST_GLSL

#include "s3d_backend.glsl"

#if defined(S3D_VULKAN)
layout(set = 0, binding = 0, std140)
#else
layout(binding = 0, std140)
#endif
uniform PostFrameBlock
{
	vec4 texelModeHistory;
	vec4 adaptation;
	vec4 tuning;
	vec4 sourceEncoding;
	vec4 cinema; // Film, vignette, grain, and Light Relief strength.
	vec4 lens; // Strength, resolution-independent spread, sample count, starburst contribution.
	vec4 eye; // Strength, scatter sample count, reference pixel scale, slow optical variation.
	vec4 perception; // Low-light strength, maximum combined gain, smooth tear-film phase sine/cosine.
	vec4 ocular; // Floater opacity, tear-film strength, floater count, framebuffer aspect ratio.
	vec4 floaterStarts[3]; // First endpoint and bend, in units of framebuffer height.
	vec4 floaterEnds[3]; // Last endpoint, soft radius, relative opacity.
} postFrame;

S3D_RESOURCE(0, 1) uniform sampler2D u_source;
S3D_RESOURCE(0, 2) uniform sampler2D u_bloom;
S3D_RESOURCE(0, 3) uniform sampler2D u_exposure;
S3D_RESOURCE(0, 4) uniform sampler2D u_flare;

vec3 SceneLinear(vec3 color)
{
	return postFrame.sourceEncoding.x > 0.5 ? color * color : max(color, vec3(0.0));
}

vec3 DisplayColor(vec3 color)
{
	return postFrame.sourceEncoding.x > 0.5 ? sqrt(max(color, vec3(0.0))) : color;
}

float ExposureGain()
{
	return postFrame.tuning.w > 0.5 ? texelFetch(u_exposure, ivec2(0), 0).r : 1.0;
}

#endif
