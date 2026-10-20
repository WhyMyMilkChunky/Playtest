#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

vec3 SampleColor(vec2 sampleUv)
{
	return texture(u_source, S3DFramebufferUv(sampleUv)).rgb;
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
	float confidence = smoothstep(threshold, min(threshold + 0.28, 0.98), brightness) *
		meanBrightness / max(brightness, 0.0001);
	return vec4(max(color * contribution, vec3(0.0)), confidence);
}

vec2 TearFilmUv(vec2 sampleUv)
{
	float strength = postFrame.ocular.y;
	if (strength <= 0.0001) return sampleUv;
	vec2 centered = sampleUv * 2.0 - 1.0;
	float peripheral = clamp(dot(centered, centered) * 0.5, 0.0, 1.0);
	vec2 ripple = vec2(postFrame.perception.z * 0.65 + postFrame.perception.w * centered.y * 0.22,
		postFrame.perception.w * 0.45 + postFrame.perception.z * centered.x * centered.x * 0.20);
	// At Bonkers this shifts only defocused light by a few reference pixels, never the scene.
	return sampleUv + ripple * postFrame.texelModeHistory.xy * postFrame.eye.z *
		strength * (5.0 + peripheral * 5.0);
}

vec2 TearFilmSpread(vec2 offset)
{
	float strength = postFrame.ocular.y;
	if (strength <= 0.0001) return offset;
	vec2 centered = uv * 2.0 - 1.0;
	float ripple = postFrame.perception.z * (0.60 + 0.40 * centered.x * centered.x) +
		postFrame.perception.w * centered.y * 0.30;
	// A slow, uneven moisture sheet reshapes only the light kernel. Scene UVs stay untouched.
	// Preserve the kernel weights and reuse its taps instead of adding a blur pass or brightness pulse.
	offset.x += offset.y * strength * (ripple * 0.55 + centered.x * 0.20) /
		max(postFrame.ocular.w, 0.1);
	offset.y *= 1.0 + strength * (0.18 + ripple * 0.06 + centered.y * centered.y * 0.08);
	return offset;
}

vec4 BlurBloom()
{
	vec2 step = postFrame.texelModeHistory.z < 1.5 ?
		vec2(postFrame.texelModeHistory.x, 0.0) :
		vec2(0.0, postFrame.texelModeHistory.y);
	if (postFrame.texelModeHistory.z > 1.5) step = TearFilmSpread(step);
	vec2 sampleUv = postFrame.texelModeHistory.z > 1.5 ? TearFilmUv(uv) : uv;
	// Linear filtering pairs adjacent taps: a nine-tap Gaussian needs five fetches.
	vec4 color = texture(u_source, S3DFramebufferUv(sampleUv)) * 0.227027;
	color += (texture(u_source, S3DFramebufferUv(sampleUv + step * 1.384615)) +
		texture(u_source, S3DFramebufferUv(sampleUv - step * 1.384615))) * 0.316216;
	color += (texture(u_source, S3DFramebufferUv(sampleUv + step * 3.230769)) +
		texture(u_source, S3DFramebufferUv(sampleUv - step * 3.230769))) * 0.070270;
	return color;
}

vec4 EyeScatter(vec4 core)
{
	float strength = postFrame.eye.x;
	if (strength <= 0.0001) return core;
	// Reuse the horizontal bloom at reduced resolution; no extra render pass or scene blur.
	const vec2 directions[3] = vec2[3](vec2(0.22, 0.98), vec2(0.78, 0.63), vec2(-0.90, 0.44));
	const float radii[3] = float[3](24.0, 46.0, 72.0);
	const float weights[3] = float[3](0.50, 0.32, 0.18);
	vec3 scatter = vec3(0.0);
	float total = 0.0;
	int pairs = clamp(int(postFrame.eye.y) / 2, 1, 3);
	vec2 sampleUv = TearFilmUv(uv);
	for (int tap = 0; tap < 3; ++tap)
	{
		if (tap >= pairs) break;
		vec2 offset = directions[tap] * radii[tap] * postFrame.texelModeHistory.xy * postFrame.eye.z;
		offset = TearFilmSpread(offset);
		vec3 positive = SampleColor(sampleUv + offset), negative = SampleColor(sampleUv - offset);
		vec3 halo = (positive + negative) * 0.5;
		// Very faint spectral separation stays inside the halo, never across texture edges.
		if (pairs > 1)
			halo = mix(halo, vec3(positive.r, halo.g, negative.b), strength * 0.10);
		scatter += halo * weights[tap];
		total += weights[tap];
	}
	core.rgb = mix(core.rgb, core.rgb * 0.86 + scatter / total * 0.45, strength);
	return core;
}

vec3 LensHighlight(vec2 sampleUv)
{
	if (any(lessThan(sampleUv, vec2(0.0))) || any(greaterThan(sampleUv, vec2(1.0)))) return vec3(0.0);
	vec4 seed = texture(u_source, S3DFramebufferUv(sampleUv));
	// Relative confidence avoids dimming an isolated highlight twice after prefiltering.
	float peak = max(seed.r, max(seed.g, seed.b));
	return seed.rgb * clamp(seed.a / max(peak, 0.0001), 0.0, 1.0);
}

vec3 OpticalSpokes()
{
	// A dominant tilted axis and a shorter perpendicular axis suggest astigmatic glare.
	// Two weaker diagonal axes add eight-ray starbursts using the same convolution.
	// This is an appearance model, not a calibrated optical simulation of an eye.
	const vec2 axes[4] = vec2[4](vec2(0.978148, 0.207912), vec2(-0.207912, 0.978148),
		vec2(0.544639, 0.838671), vec2(-0.838671, 0.544639));
	const float lengths[4] = float[4](1.0, 0.62, 0.46, 0.46);
	const float distances[6] = float[6](2.0, 4.0, 7.0, 11.0, 16.0, 22.0);
	const float weights[6] = float[6](0.20, 0.15, 0.10, 0.065, 0.04, 0.02);
	vec3 streaks = vec3(0.0);
	int samples = clamp(int(postFrame.lens.z), 2, 6);
	float kernelWeight = 0.0;
	for (int tap = 0; tap < samples; ++tap) kernelWeight += weights[tap];
	for (int axis = 0; axis < 4; ++axis)
	{
		if (axis >= 2 && postFrame.lens.w <= 0.0001) break;
		vec2 step = axes[axis] * postFrame.texelModeHistory.xy * postFrame.lens.y * lengths[axis];
		float axisWeight = axis == 0 ? 0.32 : axis == 1 ? 0.20 : 0.15 * postFrame.lens.w;
		for (int tap = 0; tap < 6; ++tap)
		{
			if (tap >= samples) break;
			// Lower quality shortens the tail instead of leaving gaps that look like lamp copies.
			streaks += (LensHighlight(uv + step * distances[tap]) +
				LensHighlight(uv - step * distances[tap])) * weights[tap] * axisWeight;
		}
	}
	return streaks * (0.575 / kernelWeight) + LensHighlight(uv) * 0.06;
}

void main()
{
	if (postFrame.texelModeHistory.z < 0.5) FragColor = ExtractBloom();
	else if (postFrame.texelModeHistory.z > 2.5) FragColor = vec4(OpticalSpokes(), 1.0);
	else if (postFrame.texelModeHistory.z > 1.5) FragColor = EyeScatter(BlurBloom());
	else FragColor = BlurBloom();
}
