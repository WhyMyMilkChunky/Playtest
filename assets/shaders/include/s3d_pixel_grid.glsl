#ifndef S3D_PIXEL_GRID_GLSL
#define S3D_PIXEL_GRID_GLSL

#include "s3d_backend.glsl"

vec2 S3DTexelCenter(vec2 uv, vec2 texelCount)
{
	return (floor(uv * texelCount) + 0.5) / texelCount;
}

vec2 S3DTexelScreenOffset(vec2 uv, vec2 texelCount)
{
	vec2 uvDx = dFdx(uv);
	vec2 uvDy = S3D_DFDY(uv);
	float determinant = uvDx.x * uvDy.y - uvDx.y * uvDy.x;
	float derivativeScale = max(dot(uvDx, uvDx), dot(uvDy, uvDy));
	// A relative guard preserves very small valid close-up derivatives while
	// rejecting nearly singular UV projections at extreme viewing angles.
	if (derivativeScale <= 1e-30 || abs(determinant) <= derivativeScale * 1e-6)
		return vec2(0.0);
	vec2 texelDx = uvDx * texelCount, texelDy = uvDy * texelCount;
	float footprintSquared = max(dot(texelDx, texelDx), dot(texelDy, texelDy));
	// A subpixel texel has no stable screen-space centre to snap lighting to.
	// Keep full snapping on magnified pixels and fade it out before minification.
	float snapWeight = 1.0 - smoothstep(0.25, 1.0, footprintSquared);
	vec2 offset = S3DTexelCenter(uv, texelCount) - uv;
	return snapWeight * vec2(
		(offset.x * uvDy.y - offset.y * uvDy.x) / determinant,
		(uvDx.x * offset.y - uvDx.y * offset.x) / determinant);
}

float S3DTexelValue(float value, vec2 screenOffset)
{
	return value + dFdx(value) * screenOffset.x + S3D_DFDY(value) * screenOffset.y;
}

vec2 S3DTexelValue(vec2 value, vec2 screenOffset)
{
	return value + dFdx(value) * screenOffset.x + S3D_DFDY(value) * screenOffset.y;
}

vec3 S3DTexelValue(vec3 value, vec2 screenOffset)
{
	return value + dFdx(value) * screenOffset.x + S3D_DFDY(value) * screenOffset.y;
}

#endif
