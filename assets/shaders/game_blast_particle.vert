#version 460 core
#include "include/s3d_backend.glsl"

S3D_RESOURCE(0, 0) uniform PuffFrame
{
	mat4 viewProjection;
	vec4 right;
	vec4 up;
} frame;

struct Puff
{
	vec4 positionSize;
	vec4 colorOpacity;
	vec4 shape;
};
S3D_RESOURCE(0, 1) readonly buffer PuffInstances { Puff puffs[]; };
layout(location = 0) out vec2 uv;
layout(location = 1) flat out vec4 colorOpacity;
layout(location = 2) flat out vec4 shape;

void main()
{
#if defined(S3D_VULKAN)
	int vertex = gl_VertexIndex;
#else
	int vertex = gl_VertexID;
#endif
	const vec2 corners[6] = vec2[6](
	    vec2(-1, -1), vec2(1, -1), vec2(1, 1), vec2(-1, -1), vec2(1, 1), vec2(-1, 1));
	Puff puff = puffs[S3D_INSTANCE_INDEX];
	vec2 at = corners[vertex];
	float angle = puff.shape.x + puff.shape.y * .5;
	vec2 rotated = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * at;
	vec3 position = puff.positionSize.xyz +
	    (frame.right.xyz * rotated.x + frame.up.xyz * rotated.y) * puff.positionSize.w * .5;
	uv = at;
	colorOpacity = puff.colorOpacity;
	shape = puff.shape;
	gl_Position = S3DClipPosition(frame.viewProjection * vec4(position, 1));
}
