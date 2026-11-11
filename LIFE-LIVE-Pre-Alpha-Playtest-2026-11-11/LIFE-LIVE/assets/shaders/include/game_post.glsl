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
	vec4 cinema;            // film, cold shock, grain, adaptation state available.
	vec4 lens;              // Strength, resolution-independent spread, sample count, starburst contribution.
	vec4 eye;               // scatter strength, reserved, reference pixel scale, tear-film age.
	vec4 perception;        // twilight strength, cone/contrast response, tear-film principal axis.
	vec4 ocular;            // Floater opacity, tear-film strength, floater count, framebuffer aspect ratio.
	vec4 floaterShapes[3];  // centre and size, in units of framebuffer height.
	vec4 floaterDetails[3]; // rotation cos/sin, opacity, atlas tile.
	vec4 grading;           // theme LUT row, mix strength, vignette strength, cold exposure.
}
postFrame;

S3D_RESOURCE(0, 1) uniform sampler2D u_source;
S3D_RESOURCE(0, 2) uniform sampler2D u_bloom;
S3D_RESOURCE(0, 3) uniform sampler2D u_exposure;
S3D_RESOURCE(0, 4) uniform sampler2D u_flare;
S3D_RESOURCE(0, 5) uniform sampler2D u_floaters;
S3D_RESOURCE(0, 6) uniform sampler2D u_veil;
S3D_RESOURCE(0, 7) uniform sampler2D u_recovery;
S3D_RESOURCE(0, 8) uniform sampler2D u_gradeLut;

vec3 EyeConeResponse(vec3 color)
{
	// Bradford * linear-sRGB-to-XYZ, normalized to D65. this is a cone proxy, not spectral vision.
	return vec3(dot(color, vec3(0.449025354, 0.521914614, 0.029060032)),
	    dot(color, vec3(0.053535979, 0.924180844, 0.022283177)),
	    dot(color, vec3(0.019625519, 0.080439873, 0.899934608)));
}

vec3 EyeConeToRgb(vec3 cones)
{
	return vec3(dot(cones, vec3(2.389387599, -1.345548200, -0.043839399)),
	    dot(cones, vec3(-0.137452390, 1.161780593, -0.024328203)),
	    dot(cones, vec3(-0.039821026, -0.074501415, 1.114322441)));
}

vec3 SceneLinear(vec3 color)
{
	return postFrame.sourceEncoding.x > 0.5 ? color * color : max(color, vec3(0.0));
}

vec3 DisplayColor(vec3 color)
{
	return postFrame.sourceEncoding.x > 0.5 ? sqrt(max(color, vec3(0.0))) : color;
}

float ExposureGain() { return postFrame.tuning.w > 0.5 ? texelFetch(u_exposure, ivec2(0), 0).r : 1.0; }

#endif
