#version 460 core

#include "include/game_fog.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
S3D_RESOURCE(0, 12) uniform sampler2D u_fogScattering;
S3D_RESOURCE(0, 11) uniform sampler2DArray u_fogNoise;

float AbyssNoise(vec3 point)
{
	vec3 p = fract(point * .047 + vec3(.018, .003, -.010) * fogFrame.countsTime.z);
	float slice = p.z * 16.0 - .5, layer = floor(slice);
	float a = textureLod(u_fogNoise, vec3(p.xy, mod(layer, 16.0)), 0).r;
	float b = textureLod(u_fogNoise, vec3(p.xy, mod(layer + 1.0, 16.0)), 0).r;
	return mix(a, b, fract(slice));
}

vec4 GrandRoomAir(float depth)
{
	if (fogFrame.grandMaximum.w < .5) return vec4(0);
	vec3 ray = FogRayDirection(uv), camera = fogFrame.cameraDistance.xyz;
	vec3 safeRay = mix(ray, vec3(.00001), lessThan(abs(ray), vec3(.00001)));
	vec3 a = (fogFrame.grandMinimum.xyz - camera) / safeRay;
	vec3 b = (fogFrame.grandMaximum.xyz - camera) / safeRay;
	vec3 nearT = min(a, b), farT = max(a, b);
	float start = max(max(nearT.x, nearT.y), max(nearT.z, 0.0));
	float end = min(min(farT.x, farT.y),
	    min(farT.z, min(depth / max(dot(ray, fogFrame.flashlight.xyz), .05), 350.0)));
	if (end <= start) return vec4(0);
	float floorY = fogFrame.grandMinimum.w;
	float roofFade = min((fogFrame.grandMaximum.y - floorY) * .55, 20.0);
	float stepSize = (end - start) / 3.0, opticalDepth = 0;
	for (int i = 0; i < 3; ++i)
	{
		vec3 p = camera + ray * (start + (float(i) + .5) * stepSize);
		float pit = smoothstep(1.5, 10.0, floorY - p.y);
		float roof = smoothstep(roofFade, roofFade + 10.0, p.y - floorY);
		float density = pit * .24 + roof * .065;
		if (density < .0001) continue;
		float edge = min(min(p.x - fogFrame.grandMinimum.x, fogFrame.grandMaximum.x - p.x),
		    min(p.z - fogFrame.grandMinimum.z, fogFrame.grandMaximum.z - p.z));
		// bounded modulation rolls through the volume without ever punching transparent holes in the pit.
		opticalDepth += density * (.8 + .4 * AbyssNoise(p)) * smoothstep(0.0, 2.0, edge) * stepSize;
	}
	float opacity = FogOpacity(opticalDepth);
	return vec4(fogFrame.grandStyle.rgb * opacity, opacity);
}

vec4 RescaleFog(vec4 fog, float sampleExposure, float exposure)
{
	float opacity = clamp(fog.a, 0.0, 1.0);
	float opticalDepth = opacity < 0.01 ? opacity * (1.0 + opacity * (0.5 + opacity / 3.0))
	                                    : -log(max(1.0 - opacity, 0.0001));
	float rescaled = FogOpacity(opticalDepth * clamp(exposure / max(sampleExposure, 0.0001), 0.0, 2.0));
	return vec4(fog.rgb * (rescaled / max(opacity, 0.00001)), rescaled);
}

vec4 EstimateEdgeFog(vec3 ray, float distance)
{
	vec3 scattered = vec3(0.0);
	float opacity = 0.0;
	int volume = -1;
	for (int index = 0; index < 2; ++index)
	{
		float lower = distance * float(index) * 0.5, upper = distance * float(index + 1) * 0.5;
		vec3 point = fogFrame.cameraDistance.xyz + ray * mix(lower, upper, 0.5);
		volume = FindFogVolume(point, volume);
		if (volume < 0) continue;

		vec3 minimum = fogFrame.volumeMinimum[volume].xyz;
		vec3 coordinate =
		    (point - minimum) / max(fogFrame.volumeMaximum[volume].xyz - minimum, vec3(0.1));
		vec4 field = SampleFogField(u_fogField, coordinate, fogFrame.volumeMinimum[volume].w);
		float density = fogFrame.densityProfile.x * fogFrame.volumeMaximum[volume].w * field.a *
		    FogHeightDensity(point.y - minimum.y) * fogFrame.densityProfile.z;
		float contribution =
		    (1.0 - opacity) * FogOpacity(density * (FogNearIntegral(upper) - FogNearIntegral(lower)));
		vec3 light =
		    fogFrame.ambientDirection.xyz * 0.28 + FogRadiance(field.rgb / max(field.a, 0.15)) * 0.72;
		scattered += contribution * light * FogScatterTint();
		opacity += contribution;
	}
	return vec4(scattered, opacity);
}

vec4 ReconstructEdgeFog(vec4 closest, float sampleDepth, float depth)
{
	vec3 ray = FogRayDirection(uv);
	float rayScale = 1.0 / max(dot(ray, fogFrame.flashlight.xyz), 0.05);
	float distance = min(depth * rayScale, fogFrame.cameraDistance.w);
	float exposure = FogNearIntegral(distance);
	if (exposure <= 0.0) return vec4(0.0);

	float sampleExposure = FogNearIntegral(min(sampleDepth * rayScale, fogFrame.cameraDistance.w));
	// a foreground railing can't tell us how much air is behind it. use the cache, not a clear hole.
	if (exposure > sampleExposure * 2.0 || sampleExposure < 0.05) return EstimateEdgeFog(ray, distance);
	return RescaleFog(closest, sampleExposure, exposure);
}

vec4 UpsampleFog(float depth)
{
	vec2 size = fogFrame.projectionSize.zw;
	vec2 position = uv * size - 0.5;
	vec2 origin = floor(position), fraction = fract(position);
	vec2 fullSize = vec2(textureSize(u_fogDepth, 0));
	float inverseDepth = 1.0 / max(depth, 0.001);
	vec2 slope = vec2(dFdx(inverseDepth), S3D_DFDY(inverseDepth));
	vec4 fog = vec4(0.0), closest = vec4(0.0);
	float total = 0.0, closestError = 1e20, closestDepth = depth;
	for (int y = 0; y < 2; ++y)
		for (int x = 0; x < 2; ++x)
		{
			ivec2 pixel = clamp(ivec2(origin) + ivec2(x, y), ivec2(0), ivec2(size) - 1);
			vec2 sampleUv = (vec2(pixel) + 0.5) / size;
			float neighborDepth = FogViewDepth(texture(u_fogDepth, S3DFramebufferUv(sampleUv)).r);
			ivec2 framebufferPixel = pixel;
#if defined(S3D_VULKAN)
			framebufferPixel.y = int(size.y) - 1 - pixel.y;
#endif
			vec4 candidate = texelFetch(u_fogScattering, framebufferPixel, 0);
			float difference = abs(depth - neighborDepth);
			float expectedDepth =
			    1.0 / max(inverseDepth + dot(slope, (sampleUv - uv) * fullSize), 0.0001);
			// reciprocal depth is planar; allow matching samples on sloping floors and walls.
			if (abs(expectedDepth - depth) < max(2.0, depth * 0.25))
				difference = min(difference, abs(neighborDepth - expectedDepth));
			float error = abs(depth - neighborDepth) / max(depth, 0.3) + length(sampleUv - uv) * 0.10;
			if (error < closestError)
			{
				closestError = error;
				closest = candidate;
				closestDepth = neighborDepth;
			}
			float spatial =
			    (x == 0 ? 1.0 - fraction.x : fraction.x) * (y == 0 ? 1.0 - fraction.y : fraction.y);
			float weight = spatial * exp2(-difference / max(0.25, depth * 0.035));
			fog += candidate * weight;
			total += weight;
		}
	fog /= max(total, 0.000001);
	if (total < 0.02)
		fog =
		    mix(ReconstructEdgeFog(closest, closestDepth, depth), fog, smoothstep(0.00001, 0.02, total));
	return fog;
}

void main()
{
	float depth = FogViewDepth(texture(u_fogDepth, S3DFramebufferUv(uv)).r);
	vec4 fog = vec4(0.0);
	if (fogFrame.ambientDirection.w > 0.0) fog = UpsampleFog(depth);
	float opacity = clamp(fog.a, 0.0, 1.0);
	float base = FogBaseOpacity(depth) * (1.0 - opacity);
	vec3 color = fog.rgb + FogAtmosphereColor() * base;
	opacity = clamp(opacity + base, 0.0, 1.0);
	vec4 grand = GrandRoomAir(depth);
	color = grand.rgb + color * (1.0 - grand.a);
	opacity = grand.a + opacity * (1.0 - grand.a);
	// enough dither to break bands, without turning dim air into visible grain.
	float dither = (FogDither() - 0.5) * (0.6 / 255.0) * smoothstep(0.0, 0.16, opacity);
	FragColor = vec4(max(color + vec3(dither), vec3(0.0)), opacity);
}
