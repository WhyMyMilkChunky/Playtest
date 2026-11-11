#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

vec4 MeterVision(vec2 sampleUv)
{
	vec3 color = SceneLinear(texture(u_source, S3DFramebufferUv(sampleUv)).rgb);
	float luminance = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	vec3 cones = postFrame.perception.y > 0.0001 ? EyeConeResponse(color) / max(luminance, 0.01) : vec3(1.0);
	return vec4(log2(clamp(luminance, 0.004, 1.0)), cones);
}

void main()
{
	// Meter the central view, leaving screen edges and most of the held weapon out.
	vec2 center = vec2(0.14, 0.22) + uv * vec2(0.72, 0.64);
	vec2 step = vec2(0.72, 0.64) / 64.0;
	FragColor =
	    (MeterVision(center + step) + MeterVision(center - step) +
	        MeterVision(center + vec2(step.x, -step.y)) + MeterVision(center + vec2(-step.x, step.y))) *
	    0.25;
}
