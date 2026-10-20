#version 460 core

#include "include/s3d_backend.glsl"

out vec4 FragColor;

in vec2 uv;

S3D_RESOURCE(2, 0) uniform sampler2D u_scene;
uniform vec2 u_texelSize;
uniform float u_amount;
uniform float u_hitBlur;
uniform float u_directionalHit;
uniform vec2 u_hitDirection;

void main()
{
	vec2 centered = uv * 2.0 - 1.0;
	vec2 fromCenter = abs(centered);
	float edge = smoothstep(0.30, 1.0, max(fromCenter.x, fromCenter.y));
	float directionalEdge = 0.0;
	if (u_directionalHit > 0.0)
	{
		vec2 edgeDirection = normalize(centered + vec2(0.0001));
		float directionalResponse = max(dot(edgeDirection,
			normalize(u_hitDirection + vec2(0.0001))), 0.0);
		float directionalSquared = directionalResponse * directionalResponse;
		directionalEdge = directionalSquared * directionalSquared * edge;
	}
	float suppressionBlur = edge * smoothstep(0.0, 1.0, u_amount);
	float hitShockBlur = u_hitBlur * 0.72;
	float blurAmount = clamp(max(suppressionBlur,
		hitShockBlur + directionalEdge * u_directionalHit * 0.62), 0.0, 1.0);
	float effectStrength = max(u_amount, max(u_hitBlur, u_directionalHit));
	vec2 radius = u_texelSize * mix(3.0, 23.0, effectStrength) *
		max(blurAmount, u_hitBlur * 0.62);

	vec3 sharp = texture(u_scene, uv).rgb;
	vec3 blurred = sharp * 4.0;
	blurred += texture(u_scene, uv + vec2(radius.x, 0.0)).rgb * 2.0;
	blurred += texture(u_scene, uv - vec2(radius.x, 0.0)).rgb * 2.0;
	blurred += texture(u_scene, uv + vec2(0.0, radius.y)).rgb * 2.0;
	blurred += texture(u_scene, uv - vec2(0.0, radius.y)).rgb * 2.0;
	blurred += texture(u_scene, uv + radius).rgb;
	blurred += texture(u_scene, uv - radius).rgb;
	blurred += texture(u_scene, uv + vec2(radius.x, -radius.y)).rgb;
	blurred += texture(u_scene, uv + vec2(-radius.x, radius.y)).rgb;
	blurred *= 1.0 / 16.0;
	float mixAmount = clamp(blurAmount * (0.40 + effectStrength * 0.58),
		0.0, 0.92);
	vec3 color = mix(sharp, blurred, mixAmount);
	if (u_amount > 0.0)
	{
		float edgePressure = edge * u_amount;
		float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
		color = mix(color, vec3(luminance), edgePressure * 0.16);
		color *= 1.0 - edgePressure * 0.10;
		float vignetteRadius = length(centered * vec2(0.78, 1.0));
		float vignette = smoothstep(0.34, 1.18, vignetteRadius) * u_amount;
		color *= 1.0 - vignette * 0.32;
	}
	float directionalPressure = directionalEdge * u_directionalHit;
	color = mix(color, vec3(0.72, 0.018, 0.012), directionalPressure * 0.46);
	FragColor = vec4(color, 1.0);
}
