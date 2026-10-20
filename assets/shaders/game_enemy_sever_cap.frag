#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec3 viewPosition;
layout(location = 1) in vec3 viewNormal;
layout(location = 2) flat in vec4 capColor;

layout(location = 0) out vec4 FragColor;

void main()
{
	vec3 normal = normalize(gl_FrontFacing ? viewNormal : -viewNormal);
	vec3 viewDirection = normalize(-viewPosition);
	float facing = abs(dot(normal, viewDirection));
	float edgeResponse = 1.0 - facing;
	float edgeSquared = edgeResponse * edgeResponse;
	float wetEdge = edgeSquared * edgeSquared;
	float tissueLight = 0.44 + facing * 0.34;
	vec3 color = capColor.rgb * tissueLight +
		vec3(0.16, 0.012, 0.014) * wetEdge;
	FragColor = vec4(color, capColor.a);
}
