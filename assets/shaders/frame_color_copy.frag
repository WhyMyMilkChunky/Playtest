#version 460 core

layout(binding = 8) uniform sampler2D u_source;
layout(location = 0) out vec4 FragColor;

void main()
{
	// one source pixel per native pixel: no extra filtering, grading, or depth writes.
	FragColor = texelFetch(u_source, ivec2(gl_FragCoord.xy), 0);
}
