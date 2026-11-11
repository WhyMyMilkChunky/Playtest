#version 460 core

#include "include/s3d_backend.glsl"

S3D_RESOURCE(0, 8) uniform sampler2D u_scene;
layout(location = 0) out vec4 FragColor;

void main()
{
	// Native image coordinates: no filtering, rescaling, projection, or Y flip.
	FragColor = texelFetch(u_scene, ivec2(gl_FragCoord.xy), 0);
}
