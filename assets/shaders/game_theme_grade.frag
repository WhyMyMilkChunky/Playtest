#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

vec3 GradeLookup(vec3 color)
{
	vec3 position = clamp(color, vec3(0.0), vec3(1.0)) * 15.0;
	float first = floor(position.b), second = min(first + 1.0, 15.0);
	float row = clamp(postFrame.grading.x, 0.0, 2.0) * 16.0 + position.g + 0.5;
	vec2 firstUv = vec2(first * 16.0 + position.r + 0.5, row) / vec2(256.0, 48.0);
	vec2 secondUv = vec2(second * 16.0 + position.r + 0.5, row) / vec2(256.0, 48.0);
	// the LUT is data, so only the captured framebuffer uses the backend's Y conversion.
	return mix(textureLod(u_gradeLut, firstUv, 0.0).rgb, textureLod(u_gradeLut, secondUv, 0.0).rgb,
	    fract(position.b));
}

void main()
{
	vec3 source = max(texture(u_source, S3DFramebufferUv(uv)).rgb, vec3(0.0));
	vec3 display = postFrame.sourceEncoding.x > 0.5 ? source : sqrt(source);
	if (postFrame.grading.y > 0.0001)
	{
		vec3 graded = GradeLookup(display) + max(display - 1.0, vec3(0.0));
		display = mix(display, graded, postFrame.grading.y);
	}
	vec2 centered = uv * 2.0 - 1.0;
	float shade = 1.0 - smoothstep(0.45, 1.80, dot(centered, centered)) * postFrame.grading.z;
	display *= sqrt(shade);
	vec3 color = postFrame.sourceEncoding.x > 0.5 ? display : display * display;
	FragColor = vec4(color, 1.0);
}
