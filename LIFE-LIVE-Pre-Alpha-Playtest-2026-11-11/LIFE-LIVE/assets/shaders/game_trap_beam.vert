#version 460 core
#include "include/s3d_backend.glsl"

S3D_RESOURCE(0, 0) uniform BeamFrame { mat4 viewProjection; vec4 camera; } frame;
struct Beam { vec4 fromRadius; vec4 toPadding; vec4 halo; vec4 core; };
S3D_RESOURCE(0, 1) readonly buffer BeamInstances { Beam beams[]; };
layout(location = 0) out vec2 uv;
layout(location = 1) flat out vec3 halo;
layout(location = 2) flat out vec3 core;

void main()
{
#if defined(S3D_VULKAN)
	int vertex = gl_VertexIndex;
#else
	int vertex = gl_VertexID;
#endif
	const vec2 corners[6] = vec2[6](vec2(-1, 0), vec2(1, 0), vec2(1, 1), vec2(-1, 0), vec2(1, 1), vec2(-1, 1));
	Beam beam = beams[S3D_INSTANCE_INDEX];
	vec3 center = (beam.fromRadius.xyz + beam.toPadding.xyz) * .5;
	vec3 direction = normalize(beam.toPadding.xyz - beam.fromRadius.xyz);
	vec3 across = cross(direction, frame.camera.xyz - center);
	if (dot(across, across) < .000001)
		across = cross(direction, abs(direction.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0));
	across = normalize(across);
	vec2 at = corners[vertex];
	float radius = max(beam.fromRadius.w, length(frame.camera.xyz - center) * .0007);
	vec3 position = mix(beam.fromRadius.xyz, beam.toPadding.xyz, at.y) + across * at.x * radius * 4.0;
	// a little overlap closes the joints between angular discharge segments.
	position += direction * (at.y * 2.0 - 1.0) * radius;
	uv = at;
	halo = beam.halo.rgb;
	core = beam.core.rgb;
	gl_Position = S3DClipPosition(frame.viewProjection * vec4(position, 1));
}
