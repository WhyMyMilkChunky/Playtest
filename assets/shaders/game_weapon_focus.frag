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
} focusFrame;
S3D_RESOURCE(0, 1) uniform sampler2D u_weapon;
S3D_RESOURCE(0, 2) uniform sampler2D u_weaponDepth;
#define u_texelSize focusFrame.texelBlur.xy
#define u_blurPixels focusFrame.texelBlur.z
#define u_focusResponse focusFrame.texelBlur.w
#define u_focusAmount focusFrame.focusOpacity.x
#define u_opacity focusFrame.focusOpacity.y
#define u_thinDetailThreshold focusFrame.focusOpacity.z
#define u_thinDetailFade focusFrame.focusOpacity.w
#define u_nearDepth focusFrame.depthResponse.x
#define u_farDepth focusFrame.depthResponse.y
#define u_muzzleBlurScale focusFrame.depthResponse.z

vec4 CoverageDefocus(vec2 sampleUv, float radiusPixels, float focusCurve)
{
	const int sampleCount = 16;
	// Precomputed golden-angle aperture points preserve the optical kernel while
	// avoiding trigonometry for every covered fragment.
	const vec2 apertureSamples[sampleCount] = vec2[](
		vec2( 0.208596500,  0.000000000),
		vec2(-0.266411182,  0.177870204),
		vec2( 0.040778502, -0.338643214),
		vec2( 0.335794039,  0.319208577),
		vec2(-0.616223361, -0.079441579),
		vec2( 0.583740563, -0.270628854),
		vec2(-0.195249795,  0.529351501),
		vec2(-0.372362531, -0.522531188),
		vec2( 0.807877750,  0.215025990),
		vec2(-0.840462183,  0.252847703),
		vec2( 0.405158311, -0.631006613),
		vec2( 0.299401681,  0.695681512),
		vec2(-0.902400151, -0.381139856),
		vec2( 1.058618101, -0.169619852),
		vec2(-0.646058151,  0.669744118),
		vec2(-0.149254387, -0.839437140));
	vec2 maximumStep = u_texelSize * radiusPixels;
	vec4 coverage = texture(u_weapon, S3DFramebufferUv(sampleUv));
	for (int index = 0; index < sampleCount; ++index)
	{
		// Optical defocus is round, while binocular disparity adds a subtle
		// horizontal spread. The ellipse combines both without a double image.
		vec2 offset = apertureSamples[index] * maximumStep;
		coverage += texture(u_weapon, S3DFramebufferUv(sampleUv + offset));
	}
	coverage /= float(sampleCount + 1);

	// The transparent target turns silhouette coverage into premultiplied alpha.
	// Binocular fusion suppresses uncertain thin details but retains solid forms.
	float originalAlpha = coverage.a;
	float fusionEnd = min(u_thinDetailThreshold + 0.72, 0.98);
	float fusionAlpha = smoothstep(u_thinDetailThreshold, fusionEnd, originalAlpha);
	float resolvedAlpha = mix(originalAlpha, fusionAlpha,
		u_thinDetailFade * focusCurve);
	coverage.rgb *= resolvedAlpha / max(originalAlpha, 0.0001);
	coverage.a = resolvedAlpha;
	return coverage;
}

float SampleWeaponDepth(vec2 sampleUv)
{
	return texture(u_weaponDepth, S3DFramebufferUv(sampleUv)).r;
}

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

float DepthDefocus(float depth)
{
	float depthSpan = max(u_farDepth - u_nearDepth, 0.00001);
	float weaponDepth = clamp((depth - u_nearDepth) / depthSpan, 0.0, 1.0);
	float towardMuzzle = smoothstep(0.08, 0.92, weaponDepth);
	return mix(1.0, u_muzzleBlurScale, towardMuzzle);
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

	float depth = NearbyWeaponDepth(uv, maximumBlur);
	if (depth >= 0.999999 && sharpWeapon.a <= 0.0)
	{
		discard;
	}
	float blurRadius = maximumBlur * DepthDefocus(depth);
	FragColor = CoverageDefocus(uv, blurRadius, focusCurve) * u_opacity;
}
