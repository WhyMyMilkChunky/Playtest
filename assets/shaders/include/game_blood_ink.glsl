#ifndef S3D_GAME_BLOOD_INK_GLSL
#define S3D_GAME_BLOOD_INK_GLSL

// The CPU still stores the same 9 MiB of words. A lookup record is four words,
// so fetch its key and page together; coverage keeps four packed words/vector.
layout(std430) S3D_RESOURCE(0, 2) readonly buffer S3DBloodInkBuffer { uvec4 bloodInk[]; };

uint BloodInkHash(uint value)
{
	value = (value ^ (value >> 16)) * 0x7FEB352Du;
	value = (value ^ (value >> 15)) * 0x846CA68Bu;
	return value ^ (value >> 16);
}

float BloodInkCoverage(uvec2 tile, uint plane, uint pixel)
{
	uint hash = BloodInkHash(tile.x ^ BloodInkHash(tile.y) ^ plane);
	for (uint probe = 0u; probe < 16u; ++probe)
	{
		uvec4 entry = bloodInk[(hash + probe) & 65535u];
		uint page = entry.w;
		if (page == 0u) return 0.0;
		if (entry.x != tile.x || entry.y != tile.y || entry.z != plane) continue;
		uvec4 packedWords = bloodInk[65536u + (page - 1u) * 64u + pixel / 16u];
		uint packedInk = packedWords[(pixel / 4u) & 3u];
		return float((packedInk >> ((pixel & 3u) * 8u)) & 255u) / 255.0;
	}
	return 0.0;
}

float WorldBloodMask(vec3 point, vec3 surfaceNormal)
{
	vec3 n = normalize(surfaceNormal);
	vec3 a = abs(n);
	vec2 uv = a.y > max(a.x, a.z) ? point.xz : (a.x > a.z ? point.zy : point.xy);
	ivec2 texel = ivec2(floor(uv * 32.0));
	uvec2 tile = uvec2(texel) >> 5;
	uint pixel = (uint(texel.y) & 31u) * 32u + (uint(texel.x) & 31u);
	ivec3 q = ivec3(floor(n * 64.0 + 0.5));
	uint normalKey = BloodInkHash(uint(q.x)) ^ BloodInkHash(uint(q.y) + 17u) ^ BloodInkHash(uint(q.z) + 37u);
	float distance = dot(point, n) * 32.0;
	int plane = int(floor(distance + 0.5));
	float coverage = BloodInkCoverage(tile, normalKey ^ BloodInkHash(uint(plane) + 71u), pixel);
	// CPU ray hits and interpolated GPU positions can round opposite ways exactly
	// on a plane-quantization boundary. Check its immediate neighbor only there.
	if (abs(fract(distance) - 0.5) < 0.005)
	{
		int neighbor = plane + (fract(distance) < 0.5 ? 1 : -1);
		coverage = max(coverage, BloodInkCoverage(tile, normalKey ^ BloodInkHash(uint(neighbor) + 71u), pixel));
	}
	return coverage;
}
#endif
