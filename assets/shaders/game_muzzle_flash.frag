#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

#if S3D_VULKAN
S3D_RESOURCE(0, 0) uniform MuzzleFrameBlock
{
	mat4 mvp;
	vec4 settings;
} u_frame;
S3D_RESOURCE(1, 0) uniform sampler2D u_flash;
#define S3D_MUZZLE_INTENSITY u_frame.settings.x
#else
S3D_RESOURCE(2, 0) uniform sampler2D u_flash;
uniform float u_intensity;
#define S3D_MUZZLE_INTENSITY u_intensity
#endif

void main()
{
	vec4 sampleValue = texture(u_flash, uv);
	if (sampleValue.a < 0.015) discard;
	vec3 color = sampleValue.rgb * sampleValue.a * S3D_MUZZLE_INTENSITY;
	FragColor = vec4(color, sampleValue.a);
}
