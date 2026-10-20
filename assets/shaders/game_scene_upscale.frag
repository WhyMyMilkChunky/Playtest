#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
// Keep the upscale sampler away from legacy material texture units 0-3.
S3D_RESOURCE(0, 8) uniform sampler2D u_scene;

vec3 SourcePixel(ivec2 pixel, ivec2 size)
{
	return texelFetch(u_scene, clamp(pixel, ivec2(0), size - 1), 0).rgb;
}

float EdgeDistance(vec3 first, vec3 second)
{
	// Include chroma so similarly bright, differently colored surfaces retain their edge.
	return dot(abs(first - second), vec3(.25, .50, .25));
}

vec3 DirectionalCell(vec3 a, vec3 b, vec3 c, vec3 d, vec2 fraction,
	float scaleWeight, float contrast)
{
	vec3 linear = mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
	float mainEdge = EdgeDistance(a, d), otherEdge = EdgeDistance(b, c);
	float separation = (otherEdge - mainEdge) / max(mainEdge + otherEdge, .0001);
	float confidence = smoothstep(.15, .65, abs(separation)) * smoothstep(.02, .12, contrast);
	// Two continuous triangular interpolants follow the more coherent diagonal.
	// Each matches linear interpolation on the cell boundary; all weights remain positive.
	vec3 mainDiagonal = fraction.x >= fraction.y ?
		a * (1.0 - fraction.x) + b * (fraction.x - fraction.y) + d * fraction.y :
		a * (1.0 - fraction.y) + c * (fraction.y - fraction.x) + d * fraction.x;
	float sum = fraction.x + fraction.y;
	vec3 otherDiagonal = sum <= 1.0 ? a * (1.0 - sum) + b * fraction.x + c * fraction.y :
		b * (1.0 - fraction.y) + c * (1.0 - fraction.x) + d * (sum - 1.0);
	vec3 directional = mix(otherDiagonal, mainDiagonal, smoothstep(-.25, .25, separation));
	return mix(linear, directional, confidence * scaleWeight * .85);
}

vec3 RestoreContrast(vec3 reconstructed, vec3 linear, vec2 point, vec2 texel,
	vec3 minimum, vec3 maximum, float scaleWeight, float contrast)
{
	float strength = .24 * scaleWeight * smoothstep(.025, .12, contrast) *
		(1.0 - smoothstep(.60, 1.40, contrast));
	if (strength <= .001) return reconstructed;
	vec3 mean = (textureLod(u_scene, point - vec2(texel.x, 0), 0).rgb +
		textureLod(u_scene, point + vec2(texel.x, 0), 0).rgb +
		textureLod(u_scene, point - vec2(0, texel.y), 0).rgb +
		textureLod(u_scene, point + vec2(0, texel.y), 0).rgb) * .25;
	// True local contrast leaves a linear ramp unchanged. Bound each channel to the
	// original cell to keep lamps, railings and pixel textures free of new overshoot halos.
	vec3 limit = (maximum - minimum) * .12;
	vec3 correction = clamp((linear - mean) * strength, -limit, limit);
	return clamp(reconstructed + correction, minimum, maximum);
}

void main()
{
	vec2 point = S3DFramebufferUv(uv);
	ivec2 size = textureSize(u_scene, 0);
	vec2 source = point * vec2(size) - .5;
	ivec2 base = ivec2(floor(source));
	vec2 fraction = fract(source);
	vec3 a = SourcePixel(base, size), b = SourcePixel(base + ivec2(1, 0), size);
	vec3 c = SourcePixel(base + ivec2(0, 1), size), d = SourcePixel(base + ivec2(1, 1), size);
	vec3 minimum = min(min(a, b), min(c, d)), maximum = max(max(a, b), max(c, d));
	float mean = dot((a + b + c + d) * .25, vec3(.2126, .7152, .0722));
	float contrast = dot(maximum - minimum, vec3(.25, .50, .25)) / max(mean, .06);
	// Source pixels per output pixel: near-native scales need less reconstruction/sharpening.
	vec2 footprint = fwidth(point) * vec2(size);
	float scaleWeight = clamp((1.0 - max(footprint.x, footprint.y)) * 2.0, 0.0, 1.0);
	vec3 linear = mix(mix(a, b, fraction.x), mix(c, d, fraction.x), fraction.y);
	vec3 color = DirectionalCell(a, b, c, d, fraction, scaleWeight, contrast);
	color = RestoreContrast(color, linear, point, 1.0 / vec2(size), minimum, maximum, scaleWeight, contrast);
	FragColor = vec4(color, 1.0);
}
