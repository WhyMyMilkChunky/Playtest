#ifndef S3D_GAME_SURFACE_FRAME_GLSL
#define S3D_GAME_SURFACE_FRAME_GLSL

vec3 SurfaceFallbackTangent(vec3 surfaceNormal)
{
	vec3 reference = abs(surfaceNormal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
	return normalize(cross(reference, surfaceNormal));
}

mat3 CotangentFrame(vec3 surfaceNormal, vec3 positionDx, vec3 positionDy,
	vec2 uvDx, vec2 uvDy)
{
	vec3 perpendicularX = cross(positionDy, surfaceNormal);
	vec3 perpendicularY = cross(surfaceNormal, positionDx);
	vec3 tangent = perpendicularX * uvDx.x + perpendicularY * uvDy.x;
	vec3 bitangent = perpendicularX * uvDx.y + perpendicularY * uvDy.y;
	float lengthSquared = max(dot(tangent, tangent), dot(bitangent, bitangent));
	// Derivatives shrink with distance to the camera and framebuffer resolution.
	// Normalize the actual frame, rather than attenuating small valid derivatives.
	if (lengthSquared <= 1e-30)
	{
		tangent = SurfaceFallbackTangent(surfaceNormal);
		return mat3(tangent, cross(surfaceNormal, tangent), surfaceNormal);
	}
	float scale = inversesqrt(lengthSquared);
	return mat3(tangent * scale, bitangent * scale, surfaceNormal);
}

mat3 SurfaceSpecularFrame(vec3 surfaceNormal, vec3 surfaceTangent)
{
	vec3 tangent = surfaceTangent - surfaceNormal * dot(surfaceTangent, surfaceNormal);
	float lengthSquared = dot(tangent, tangent);
	tangent = lengthSquared > 1e-12 ? tangent * inversesqrt(lengthSquared) :
		SurfaceFallbackTangent(surfaceNormal);
	return mat3(tangent, cross(surfaceNormal, tangent), surfaceNormal);
}

vec3 NormalizeSurfaceDirection(vec3 direction, vec3 fallback)
{
	float lengthSquared = dot(direction, direction);
	return lengthSquared > 1e-12 ? direction * inversesqrt(lengthSquared) : fallback;
}

vec3 SurfaceViewNormal(vec3 geometricNormal, vec3 mappedNormal, vec3 viewDirection)
{
	float coarseView = max(dot(geometricNormal, viewDirection), 0.0);
	// Large authored texels cannot represent their own grazing-angle occlusion.
	// Fade the perturbation smoothly there; close, face-on detail stays intact.
	float facetVisibility = smoothstep(0.02, 0.28, coarseView);
	vec3 candidate = NormalizeSurfaceDirection(mix(geometricNormal, mappedNormal, facetVisibility), geometricNormal);
	float mappedView = dot(candidate, viewDirection);
	float minimumView = coarseView * 0.08;
	float correction = clamp((minimumView - mappedView) /
		max(coarseView - mappedView, 0.000001), 0.0, 1.0);
	return NormalizeSurfaceDirection(mix(candidate, geometricNormal, correction), geometricNormal);
}

#endif
