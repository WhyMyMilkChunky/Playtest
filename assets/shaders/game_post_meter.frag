#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

float LogLuminance(vec2 sampleUv)
{
	vec3 color = SceneLinear(texture(u_source, S3DFramebufferUv(sampleUv)).rgb);
	return log2(clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.004, 1.0));
}

void main()
{
	// Meter the central view, leaving screen edges and most of the held weapon out.
	vec2 center = vec2(0.14, 0.22) + uv * vec2(0.72, 0.64);
	vec2 step = vec2(0.72, 0.64) / 64.0;
	float luminance = LogLuminance(center + step) +
		LogLuminance(center - step) +
		LogLuminance(center + vec2(step.x, -step.y)) +
		LogLuminance(center + vec2(-step.x, step.y));
	FragColor = vec4(luminance * 0.25, 0.0, 0.0, 1.0);
}
