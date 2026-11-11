#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

vec3 SampleColor(vec2 sampleUv) { return texture(u_source, S3DFramebufferUv(sampleUv)).rgb; }

float OpticalPupil()
{
	return postFrame.perception.y > 0.0001 ? clamp(texelFetch(u_exposure, ivec2(0), 0).b, 0.0, 1.0) : 0.0;
}

vec4 ExtractBloom()
{
	vec2 step = postFrame.texelModeHistory.xy;
	vec3 first = SceneLinear(SampleColor(uv + step));
	vec3 second = SceneLinear(SampleColor(uv - step));
	vec3 third = SceneLinear(SampleColor(uv + vec2(step.x, -step.y)));
	vec3 fourth = SceneLinear(SampleColor(uv + vec2(-step.x, step.y)));
	float exposure = ExposureGain();
	vec3 color = (first + second + third + fourth) * 0.25 * exposure;
	vec3 peak = max(max(first, second), max(third, fourth)) * exposure;
	// Retain small lamp peaks before averaging; otherwise distant fixtures lose all glare seeds.
	float brightness = max(peak.r, max(peak.g, peak.b));
	float threshold = postFrame.tuning.z * postFrame.tuning.z;
	float knee = 0.10;
	float soft = clamp(brightness - threshold + knee, 0.0, 2.0 * knee);
	soft = soft * soft / (4.0 * knee);
	float contribution = max(soft, brightness - threshold) / max(brightness, 0.0001);
	// Alpha records strong-highlight confidence for the lens pass; float targets retain bright peaks.
	float meanBrightness = max(color.r, max(color.g, color.b));
	float confidence = smoothstep(threshold, min(threshold + 0.28, 0.98), brightness) * meanBrightness /
	                   max(brightness, 0.0001);
	return vec4(max(color * contribution, vec3(0.0)), confidence);
}

vec2 LivingEyeOffset(vec2 offset)
{
	float strength = postFrame.ocular.y;
	if (strength <= 0.0001) return offset;
	vec2 axis = postFrame.perception.zw;
	// film renewal alters the blur covariance, never scene UVs or total kernel weight.
	float anisotropy = strength * (0.12 + postFrame.eye.w * 0.30);
	return offset + axis * dot(offset, axis) * anisotropy;
}

vec4 GaussianBlur(vec2 step)
{
	step = LivingEyeOffset(step);
	vec2 sampleUv = uv;
	// Linear filtering pairs adjacent taps: a nine-tap Gaussian needs five fetches.
	vec4 color = texture(u_source, S3DFramebufferUv(sampleUv)) * 0.227027;
	color += (texture(u_source, S3DFramebufferUv(sampleUv + step * 1.384615)) +
	             texture(u_source, S3DFramebufferUv(sampleUv - step * 1.384615))) *
	         0.316216;
	color += (texture(u_source, S3DFramebufferUv(sampleUv + step * 3.230769)) +
	             texture(u_source, S3DFramebufferUv(sampleUv - step * 3.230769))) *
	         0.070270;
	return color;
}

vec4 BlurBloom(float pupil)
{
	vec2 step = postFrame.texelModeHistory.z < 1.5 ? vec2(postFrame.texelModeHistory.x, 0.0)
	                                               : vec2(0.0, postFrame.texelModeHistory.y);
	return GaussianBlur(step * mix(1.0, mix(1.05, 1.65, pupil), postFrame.eye.x));
}

vec4 DownsampleVeil()
{
	vec2 step = postFrame.texelModeHistory.xy;
	return vec4((SampleColor(uv + step) + SampleColor(uv - step) + SampleColor(uv + vec2(step.x, -step.y)) +
	                SampleColor(uv + vec2(-step.x, step.y))) *
	                0.25,
	    0.0);
}

vec4 BlurVeil(float pupil)
{
	vec2 step = postFrame.texelModeHistory.z < 5.5 ? vec2(postFrame.texelModeHistory.x, 0.0)
	                                               : vec2(0.0, postFrame.texelModeHistory.y);
	// prefilter first, then convolve both axes. sparse distant taps just made lamp-shaped ghosts.
	return GaussianBlur(step * postFrame.eye.z * mix(14.0, 22.0, pupil));
}

vec3 LensHighlight(vec2 sampleUv)
{
	if (any(lessThan(sampleUv, vec2(0.0))) || any(greaterThan(sampleUv, vec2(1.0)))) return vec3(0.0);
	vec4 seed = texture(u_source, S3DFramebufferUv(sampleUv));
	// Relative confidence avoids dimming an isolated highlight twice after prefiltering.
	float peak = max(seed.r, max(seed.g, seed.b));
	return seed.rgb * clamp(seed.a / max(peak, 0.0001), 0.0, 1.0);
}

vec3 OpticalSpokes(float pupil)
{
	// A dominant tilted axis and a shorter perpendicular axis suggest astigmatic glare.
	// Two weaker diagonal axes add eight-ray starbursts using the same convolution.
	// This is an appearance model, not a calibrated optical simulation of an eye.
	const vec2 axes[4] = vec2[4](vec2(0.978148, 0.207912), vec2(-0.207912, 0.978148),
	    vec2(0.544639, 0.838671), vec2(-0.838671, 0.544639));
	const float lengths[4] = float[4](1.0, 0.62, 0.46, 0.46);
	const float weights[6] = float[6](0.28, 0.24, 0.19, 0.14, 0.09, 0.06);
	vec3 streaks = vec3(0.0);
	int samples = clamp(int(postFrame.lens.z), 2, 6);
	float kernelWeight = 0.0;
	for (int tap = 0; tap < samples; ++tap) kernelWeight += weights[tap];
	for (int axis = 0; axis < 4; ++axis)
	{
		if (axis >= 2 && postFrame.lens.w <= 0.0001) break;
		vec2 step = axes[axis] * postFrame.texelModeHistory.xy * postFrame.lens.y * lengths[axis] *
		            mix(1.6, 2.0, pupil);
		float axisWeight = axis == 0 ? 0.32 : axis == 1 ? 0.20 : 0.15 * postFrame.lens.w;
		for (int tap = 0; tap < 6; ++tap)
		{
			if (tap >= samples) break;
			// Lower quality shortens the tail instead of leaving gaps that look like lamp copies.
			streaks +=
			    (LensHighlight(uv + step * float(tap + 1)) + LensHighlight(uv - step * float(tap + 1))) *
			    weights[tap] * axisWeight;
		}
	}
	return streaks * (0.575 / kernelWeight) + LensHighlight(uv) * 0.06;
}

void main()
{
	float pupil = postFrame.texelModeHistory.z > 0.5 ? OpticalPupil() : 0.0;
	if (postFrame.texelModeHistory.z < 0.5)
		FragColor = ExtractBloom();
	else if (postFrame.texelModeHistory.z > 4.5)
		FragColor = BlurVeil(pupil);
	else if (postFrame.texelModeHistory.z > 3.5)
		FragColor = DownsampleVeil();
	else if (postFrame.texelModeHistory.z > 2.5)
		FragColor = vec4(OpticalSpokes(pupil), 1.0);
	else
		FragColor = BlurBloom(pupil);
}
