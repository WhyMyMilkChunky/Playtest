#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
S3D_RESOURCE(0, 8) uniform sampler2D u_scene;

void main()
{
	FragColor = texture(u_scene, S3DFramebufferUv(uv));
}
