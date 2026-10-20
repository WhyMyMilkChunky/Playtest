#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) out vec2 uv;

void main()
{
#if defined(S3D_VULKAN)
	int vertex = gl_VertexIndex;
#else
	int vertex = gl_VertexID;
#endif
	vec2 position = vertex == 0 ? vec2(-1.0, -1.0) :
		(vertex == 1 ? vec2(3.0, -1.0) : vec2(-1.0, 3.0));
	gl_Position = vec4(position, 0.0, 1.0);
	uv = position * 0.5 + 0.5;
}
