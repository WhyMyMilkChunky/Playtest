#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 2) in vec2 aTcoord;

layout(location = 0) out vec2 uv;

S3D_RESOURCE(0, 0) uniform MuzzleFrameBlock
{
	mat4 mvp;
	vec4 settings;
} u_frame;

void main()
{
	uv = aTcoord;
	gl_Position = S3DClipPosition(u_frame.mvp * vec4(aPosition, 1.0));
}
