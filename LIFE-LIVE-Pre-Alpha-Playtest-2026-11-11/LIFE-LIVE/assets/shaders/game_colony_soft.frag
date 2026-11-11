#version 460 core
#include "include/s3d_backend.glsl"

S3D_RESOURCE(0, 0) layout(std140) uniform SoftFrame { vec4 stepOpacity; };
S3D_RESOURCE(0, 1) uniform sampler2D u_bugs;
layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

void main()
{
	vec2 stepUv = stepOpacity.xy;
	vec4 color = texture(u_bugs, S3DFramebufferUv(uv)) * .2270270270;
	color += texture(u_bugs, S3DFramebufferUv(uv + stepUv * 1.3846153846)) * .3162162162;
	color += texture(u_bugs, S3DFramebufferUv(uv - stepUv * 1.3846153846)) * .3162162162;
	color += texture(u_bugs, S3DFramebufferUv(uv + stepUv * 3.2307692308)) * .0702702703;
	color += texture(u_bugs, S3DFramebufferUv(uv - stepUv * 3.2307692308)) * .0702702703;
	// blur colour and coverage together; no hard alpha threshold or opaque centre.
	FragColor = color * stepOpacity.z;
}
