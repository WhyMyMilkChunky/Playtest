#version 460 core
#include "include/s3d_backend.glsl"

S3D_RESOURCE(0, 0) uniform FlowFrame
{
	mat4 viewProjection;
	vec4 time;
}
frame;
struct Flow
{
	vec4 centerLength;
	vec4 alongWidth;
	vec4 acrossSeed;
	vec4 colorSpeed;
};
S3D_RESOURCE(0, 1) readonly buffer FlowInstances { Flow flows[]; };
layout(location = 0) out vec2 flowUv;
layout(location = 1) flat out vec4 colorTime;
layout(location = 2) flat out float seed;

void main()
{
#if defined(S3D_VULKAN)
	int vertex = gl_VertexIndex;
#else
	int vertex = gl_VertexID;
#endif
	const vec2 corners[6] =
	    vec2[6](vec2(-1, -1), vec2(1, -1), vec2(1, 1), vec2(-1, -1), vec2(1, 1), vec2(-1, 1));
	Flow flow = flows[S3D_INSTANCE_INDEX];
	vec2 at = corners[vertex] * vec2(flow.alongWidth.w, flow.centerLength.w);
	vec3 position = flow.centerLength.xyz + flow.acrossSeed.xyz * at.x + flow.alongWidth.xyz * at.y;
	flowUv = at;
	seed = flow.acrossSeed.w;
	colorTime = vec4(flow.colorSpeed.rgb, frame.time.x * flow.colorSpeed.w);
	gl_Position = S3DClipPosition(frame.viewProjection * vec4(position, 1));
}
