#version 460 core

#include "include/game_fog.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
S3D_RESOURCE(0, 12) uniform sampler2D u_fogScattering;

vec4 ShortenFog(vec4 fog, float sampleDepth, float depth)
{
	float ratio = clamp((depth - 0.6) / max(sampleDepth - 0.6, 0.001), 0.0, 1.0);
	float opacity = clamp(fog.a, 0.0, 1.0);
	float shortened = 1.0 - pow(max(1.0 - opacity, 0.0001), ratio);
	return vec4(fog.rgb * (shortened / max(opacity, 0.00001)), shortened);
}

vec4 UpsampleFog(float depth)
{
	vec2 size = fogFrame.projectionSize.zw;
	vec2 position = uv * size - 0.5;
	vec2 origin = floor(position), fraction = fract(position);
	vec2 fullSize = vec2(textureSize(u_fogDepth, 0));
	float inverseDepth = 1.0 / max(depth, 0.001);
	vec2 slope = vec2(dFdx(inverseDepth), dFdy(inverseDepth));
	vec4 fog = vec4(0.0), closest = vec4(0.0);
	float total = 0.0, closestError = 1e20, closestDepth = depth;
	for (int y = 0; y < 2; ++y)
		for (int x = 0; x < 2; ++x)
		{
			ivec2 pixel = clamp(ivec2(origin) + ivec2(x, y), ivec2(0), ivec2(size) - 1);
			vec2 sampleUv = (vec2(pixel) + 0.5) / size;
			float neighborDepth = FogViewDepth(texture(u_fogDepth, sampleUv).r);
			vec4 candidate = texelFetch(u_fogScattering, pixel, 0);
			float difference = abs(depth - neighborDepth);
			float expectedDepth = 1.0 / max(inverseDepth + dot(slope, (sampleUv - uv) * fullSize), 0.0001);
			// Reciprocal depth is planar; allow matching samples on sloping floors and walls.
			if (abs(expectedDepth - depth) < max(2.0, depth * 0.25))
				difference = min(difference, abs(neighborDepth - expectedDepth));
			float error = abs(depth - neighborDepth) / max(depth, 0.3) + length(sampleUv - uv) * 0.10;
			if (error < closestError) { closestError = error; closest = candidate; closestDepth = neighborDepth; }
			float spatial = (x == 0 ? 1.0 - fraction.x : fraction.x) * (y == 0 ? 1.0 - fraction.y : fraction.y);
			float weight = spatial * exp2(-difference / max(0.25, depth * 0.035));
			fog += candidate * weight;
			total += weight;
		}
	fog /= max(total, 0.000001);
	// Depth disagreement must not cut clear holes around railings. Shorten a farther
	// sample to the foreground depth, and transition smoothly to the filtered result.
	if (total < 0.01)
		fog = mix(ShortenFog(closest, closestDepth, depth), fog, smoothstep(0.00001, 0.01, total));
	return fog;
}

void main()
{
	float depth = FogViewDepth(texture(u_fogDepth, uv).r);
	vec4 fog = vec4(0.0);
	if (fogFrame.ambientDirection.w > 0.0) fog = UpsampleFog(depth);
	float opacity = clamp(fog.a, 0.0, 1.0);
	float base = FogBaseOpacity(depth) * (1.0 - opacity);
	vec3 color = fog.rgb + FogAtmosphereColor() * base;
	opacity = clamp(opacity + base, 0.0, 1.0);
	// Reduce visible bands when blending into the scene's fixed-point colour buffer.
	float dither = (FogDither() - 0.5) / 255.0 * smoothstep(0.0, 0.06, opacity);
	FragColor = vec4(max(color + vec3(dither), vec3(0.0)), opacity);
}
