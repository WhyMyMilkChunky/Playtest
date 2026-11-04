#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) out vec4 FragColor;
layout(location = 0) in vec2 uv;

#if defined(S3D_VULKAN)
layout(set = 0, binding = 0, std140)
#else
layout(binding = 0, std140)
#endif
    uniform FocusFrameBlock
{
	vec4 texelBlur;
	vec4 focusOpacity;
	vec4 depthResponse;
}
focusFrame;
S3D_RESOURCE(0, 1) uniform sampler2D u_weapon;
S3D_RESOURCE(0, 2) uniform sampler2D u_weaponDepth;
#define u_texelSize focusFrame.texelBlur.xy
#define u_blurPixels focusFrame.texelBlur.z
#define u_focusResponse focusFrame.texelBlur.w
#define u_focusAmount focusFrame.focusOpacity.x
#define u_opacity focusFrame.focusOpacity.y
#define u_focusDiopters focusFrame.focusOpacity.z
#define u_projectionDepth focusFrame.depthResponse.xy
#define u_aperturePixels focusFrame.depthResponse.z
#define u_eyeColorSoftness focusFrame.depthResponse.w

vec4 CoverageDefocus(vec2 sampleUv, float radiusPixels, float solidCoverage)
{
	const int sampleCount = 16;
	// Precomputed golden-angle aperture points preserve the optical kernel while
	// avoiding trigonometry for every covered fragment.
	const vec2 apertureSamples[sampleCount] = vec2[](vec2(0.208596500, 0.000000000),
	    vec2(-0.266411182, 0.177870204), vec2(0.040778502, -0.338643214), vec2(0.335794039, 0.319208577),
	    vec2(-0.616223361, -0.079441579), vec2(0.583740563, -0.270628854), vec2(-0.195249795, 0.529351501),
	    vec2(-0.372362531, -0.522531188), vec2(0.807877750, 0.215025990), vec2(-0.840462183, 0.252847703),
	    vec2(0.405158311, -0.631006613), vec2(0.299401681, 0.695681512), vec2(-0.902400151, -0.381139856),
	    vec2(1.058618101, -0.169619852), vec2(-0.646058151, 0.669744118), vec2(-0.149254387, -0.839437140));
	vec2 maximumStep = u_texelSize * radiusPixels;
	vec4 coverage = texture(u_weapon, S3DFramebufferUv(sampleUv));
	vec3 color = coverage.rgb, colorWeights = vec3(1.0);
	float softness = u_eyeColorSoftness * smoothstep(0.5, 6.0, radiusPixels);
	for (int index = 0; index < sampleCount; ++index)
	{
		vec2 offset = apertureSamples[index] * maximumStep;
		vec4 tap = texture(u_weapon, S3DFramebufferUv(sampleUv + offset));
		if (softness > 0.0001)
		{
			// wavelength profiles share the same taps and alpha coverage. focused edges stay sharp.
			float radius = dot(apertureSamples[index], apertureSamples[index]);
			vec3 weight = vec3(1.0) + vec3(-0.32, 0.0, 0.42) * softness * radius;
			color += tap.rgb * weight;
			colorWeights += weight;
		}
		coverage += tap;
	}
	coverage /= float(sampleCount + 1);
	if (softness > 0.0001) coverage.rgb = color / colorWeights;

	// normalize colour against covered samples. defocus doesn't make a solid rear sight translucent.
	vec3 opaqueColor = coverage.rgb / max(coverage.a, 0.0001);
	coverage.a = max(coverage.a, solidCoverage);
	coverage.rgb = opaqueColor * coverage.a;
	return coverage;
}

float SampleWeaponDepth(vec2 sampleUv) { return texture(u_weaponDepth, S3DFramebufferUv(sampleUv)).r; }

float NearbyWeaponDepth(vec2 sampleUv, float radiusPixels)
{
	vec2 reach = u_texelSize * radiusPixels * 0.72;
	float depth = SampleWeaponDepth(sampleUv);
	depth = min(depth, SampleWeaponDepth(sampleUv + vec2(reach.x, 0.0)));
	depth = min(depth, SampleWeaponDepth(sampleUv - vec2(reach.x, 0.0)));
	depth = min(depth, SampleWeaponDepth(sampleUv + vec2(0.0, reach.y)));
	depth = min(depth, SampleWeaponDepth(sampleUv - vec2(0.0, reach.y)));
	vec2 diagonal = reach * 0.70710678;
	depth = min(depth, SampleWeaponDepth(sampleUv + diagonal));
	depth = min(depth, SampleWeaponDepth(sampleUv - diagonal));
	depth = min(depth, SampleWeaponDepth(sampleUv + vec2(diagonal.x, -diagonal.y)));
	depth = min(depth, SampleWeaponDepth(sampleUv + vec2(-diagonal.x, diagonal.y)));
	return depth;
}

float DepthDefocus(float depth, float focusCurve)
{
	// both backends store perspective depth in [0,1]; undo the weapon projection before comparing focus.
	float inverseDistance = abs((depth * 2.0 - 1.0 + u_projectionDepth.x) / u_projectionDepth.y);
	float circleRadius = u_aperturePixels * abs(inverseDistance - u_focusDiopters);
	return min(u_blurPixels, circleRadius) * focusCurve;
}

void main()
{
	vec4 sharpWeapon = texture(u_weapon, S3DFramebufferUv(uv));
	float focusCurve = pow(smoothstep(0.0, 1.0, u_focusAmount), u_focusResponse);
	float maximumBlur = u_blurPixels * focusCurve;
	if (maximumBlur <= 0.01)
	{
		if (sharpWeapon.a <= 0.0) discard;
		FragColor = sharpWeapon * u_opacity;
		return;
	}

	float depth = sharpWeapon.a > 0.5 ? SampleWeaponDepth(uv) : NearbyWeaponDepth(uv, maximumBlur);
	if (depth >= 0.999999 && sharpWeapon.a <= 0.0)
	{
		discard;
	}
	float blurRadius = DepthDefocus(depth, focusCurve);
	if (blurRadius <= 0.35)
	{
		if (sharpWeapon.a <= 0.0) discard;
		FragColor = sharpWeapon * u_opacity;
		return;
	}
	FragColor = CoverageDefocus(uv, blurRadius, sharpWeapon.a) * u_opacity;
}
