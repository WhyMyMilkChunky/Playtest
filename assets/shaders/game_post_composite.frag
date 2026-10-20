#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

vec3 FilmResponse(vec3 color)
{
	float strength = postFrame.cinema.x;
	float luminance = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	// Gentle contrast around middle gray, without tinting whites or crushing all dark detail.
	color *= 1.0 + strength * 0.12 * (luminance - 0.18) / (luminance + 0.18);
	float peak = max(color.r, max(color.g, color.b));
	float shoulder = mix(0.80, 0.65, strength);
	if (peak > shoulder && postFrame.sourceEncoding.z < 0.5)
		color *= (shoulder + (1.0 - shoulder) *
			(1.0 - exp(-(peak - shoulder) / (1.0 - shoulder)))) / peak;
	return color;
}

float FilmGrain(vec2 pixel, float frame)
{
	vec3 value = fract(vec3(pixel.xyx) * 0.1031 + frame * 0.017);
	value += dot(value, value.yzx + 33.33);
	return fract((value.x + value.y) * value.z) - 0.5;
}

vec2 LightReliefDetail(vec3 scene, vec2 sampleUv, float exposure)
{
	ivec2 size = textureSize(u_source, 0), last = size - ivec2(1);
	ivec2 pixel = clamp(ivec2(S3DFramebufferUv(sampleUv) * vec2(size)), ivec2(0), last);
	const ivec2 offsets[4] = ivec2[4](ivec2(-1, 0), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1));
	const vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
	float center = dot(scene, luminanceWeights);
	float mean = 0.0, minimum = center, maximum = center;
	for (int tap = 0; tap < 4; ++tap)
	{
		vec3 neighbor = SceneLinear(texelFetch(u_source,
			clamp(pixel + offsets[tap], ivec2(0), last), 0).rgb) * exposure;
		float value = dot(neighbor, luminanceWeights);
		mean += value * 0.25;
		minimum = min(minimum, value);
		maximum = max(maximum, value);
	}
	// Silhouettes and lamp edges keep their original response; only fine detail is protected.
	float edgeConfidence = 1.0 - smoothstep(0.35, 0.85, (maximum - minimum) / max(mean, 0.04));
	float detail = clamp((center - mean) / max(mean, 0.04), -0.20, 0.20);
	return vec2(detail, edgeConfidence);
}

vec3 LightReliefResponse(vec3 scene, vec3 glow, vec2 sampleUv, float exposure)
{
	// Disabled presets take a draw-wide exit before any local-detail work.
	if (postFrame.cinema.w <= 0.0001) return FilmResponse(scene + glow);
	float glowLuminance = max(dot(glow, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	float brightness = max(scene.r, max(scene.g, scene.b));
	float weight = postFrame.cinema.w * smoothstep(0.30, 0.85, brightness) *
		smoothstep(0.008, 0.08, glowLuminance);
	if (weight <= 0.0001) return FilmResponse(scene + glow);
	vec2 detail = LightReliefDetail(scene, sampleUv, exposure);
	weight *= detail.y;
	// Make glow follow existing texture contrast inside its core, leaving the halo alone.
	vec3 color = FilmResponse(scene + glow * (1.0 + detail.x * weight * 2.0));
	float luminance = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
	float peak = max(color.r, max(color.g, color.b));
	// Restore a bounded part of contrast lost to the shoulder, using only retained scene detail.
	float headroom = max(1.0 - peak, 0.0) * luminance / max(peak, 0.0001);
	float relief = clamp(detail.x * weight * min(glowLuminance * 0.8, 0.12),
		-0.025, headroom);
	return color * max(1.0 + relief / luminance, 0.0);
}

vec3 LowLightResponse(vec3 scene, vec2 sampleUv, float exposure, float darkness)
{
	float strength = postFrame.perception.x * darkness;
	if (strength <= 0.0001) return scene;
	float luminance = dot(scene, vec3(0.2126, 0.7152, 0.0722));
	// Local darkness keeps lit screens, lamps and colored accents out of the response.
	float shadow = 1.0 - smoothstep(0.012, 0.09, luminance / max(exposure, 0.0001));
	vec2 centered = sampleUv * 2.0 - 1.0;
	float peripheral = smoothstep(0.08, 0.75, dot(centered, centered));
	float weight = strength * shadow * (0.75 + peripheral * 0.25);
	// Reduce color confidence and reveal retained shadow detail; black never becomes gray fog.
	vec3 color = mix(scene, vec3(luminance), weight * 0.78);
	float gain = min(1.0 + weight * 0.30, postFrame.perception.y / max(exposure, 1.0));
	return color * max(gain, 1.0);
}

vec3 EyeOpticsResponse(vec3 glow, vec2 sampleUv, float recovery)
{
	float strength = postFrame.eye.x;
	if (strength <= 0.0001) return glow;
	vec2 centered = sampleUv * 2.0 - 1.0;
	float peripheral = smoothstep(0.08, 0.75, dot(centered, centered));
	float upper = smoothstep(0.46, 0.86, sampleUv.y);
	float curve = 0.05 * (1.0 - centered.x * centered.x) + postFrame.eye.w * 0.004;
	float first = (sampleUv.y - 0.80 - curve) / 0.16;
	float second = (sampleUv.y - 0.94 + curve * 0.5) / 0.085;
	// Broad defocused interruptions exist only in emitted glow, never as hair over the scene.
	float lash = min((1.0 - smoothstep(0.0, 2.0, first * first)) +
		0.5 * (1.0 - smoothstep(0.0, 2.0, second * second)), 1.0) * upper;
	float transmission = 1.0 - lash * strength * 0.32;
	// The peripheral veil must not cancel the defocused lash attenuation.
	float veil = strength * (0.04 + peripheral * 0.16 + recovery * 0.22) * (1.0 - lash * 0.85);
	return glow * transmission * (1.0 + veil);
}

float FloaterSegmentDistance(vec2 point, vec2 start, vec2 end)
{
	vec2 segment = end - start;
	float along = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.000001), 0.0, 1.0);
	return length(point - start - segment * along);
}

float FloaterCoverage(vec2 point)
{
	float coverage = 0.0;
	int count = clamp(int(postFrame.ocular.z), 0, 3);
	for (int index = 0; index < 3; ++index)
	{
		if (index >= count) break;
		vec4 start = postFrame.floaterStarts[index], end = postFrame.floaterEnds[index];
		vec2 lower = min(min(start.xy, start.zw), end.xy) - end.z * 2.0;
		vec2 upper = max(max(start.xy, start.zw), end.xy) + end.z * 2.0;
		// Most fragments exit on the small bounds, before distance or local-contrast work.
		if (any(lessThan(point, lower)) || any(greaterThan(point, upper))) continue;
		float distance = min(FloaterSegmentDistance(point, start.xy, start.zw),
			FloaterSegmentDistance(point, start.zw, end.xy));
		float strand = 1.0 - smoothstep(end.z * 0.25, end.z * 1.75, distance);
		coverage = max(coverage, strand * end.w);
	}
	return coverage;
}

float FloaterSurfaceConfidence(vec2 sampleUv, float center, float exposure)
{
	ivec2 size = textureSize(u_source, 0), last = size - ivec2(1);
	ivec2 pixel = clamp(ivec2(S3DFramebufferUv(sampleUv) * vec2(size)), ivec2(0), last);
	int radius = max(int(float(size.y) * 0.007), 1);
	const ivec2 offsets[4] = ivec2[4](ivec2(-1, 0), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1));
	float minimum = center, maximum = center, mean = center * 0.20;
	for (int tap = 0; tap < 4; ++tap)
	{
		vec3 neighbor = SceneLinear(texelFetch(u_source,
			clamp(pixel + offsets[tap] * radius, ivec2(0), last), 0).rgb) * exposure;
		float value = dot(neighbor, vec3(0.2126, 0.7152, 0.0722));
		minimum = min(minimum, value);
		maximum = max(maximum, value);
		mean += value * 0.20;
	}
	// Grime and pixel texture soften the effect rather than deleting it; hard edges remain protected.
	return mix(1.0, 0.25, smoothstep(0.15, 0.65, (maximum - minimum) / max(mean, 0.04)));
}

float FloaterTransmission(vec3 scene, vec2 sampleUv, float exposure)
{
	if (postFrame.ocular.x <= 0.0001 || postFrame.ocular.z < 0.5) return 1.0;
	float luminance = max(dot(scene, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	float bright = smoothstep(0.035, 0.20, luminance);
	if (bright <= 0.0001) return 1.0;
	vec2 scale = vec2(postFrame.ocular.w, 1.0);
	// Height-based coordinates keep the strands round on widescreen and at different resolutions.
	float coverage = FloaterCoverage(sampleUv * scale);
	if (coverage <= 0.0001) return 1.0;
	vec2 centered = (sampleUv - 0.5) * scale;
	coverage *= smoothstep(0.0144, 0.0576, dot(centered, centered));
	if (coverage <= 0.0001) return 1.0;
	float plainSurface = FloaterSurfaceConfidence(sampleUv, luminance, exposure);
	return 1.0 - postFrame.ocular.x * coverage * bright * plainSurface;
}

void main()
{
	vec4 exposureState = postFrame.tuning.w > 0.5 ?
		texelFetch(u_exposure, ivec2(0), 0) : vec4(1.0, 0.0, 0.0, 0.0);
	float exposure = exposureState.r;
	vec3 scene = SceneLinear(texture(u_source, S3DFramebufferUv(uv)).rgb) * exposure;
	float floaterTransmission = FloaterTransmission(scene, uv, exposure);
	scene = LowLightResponse(scene, uv, exposure, exposureState.a);
	vec3 glow = vec3(0.0);
	if (postFrame.tuning.y > 0.0)
		glow += texture(u_bloom, S3DFramebufferUv(uv)).rgb * postFrame.tuning.y;
	if (postFrame.lens.x > 0.0)
		glow += texture(u_flare, S3DFramebufferUv(uv)).rgb * postFrame.lens.x;
	glow = EyeOpticsResponse(glow, uv, exposureState.b);
	vec3 color = LightReliefResponse(scene, glow, uv, exposure) * floaterTransmission;
	vec2 centered = uv * 2.0 - 1.0;
	float falloff = smoothstep(0.55, 2.0, dot(centered, centered));
	color *= 1.0 - falloff * postFrame.cinema.y;
	vec3 display = DisplayColor(color);
	if (postFrame.cinema.z > 0.0)
	{
		float luminance = dot(display, vec3(0.2126, 0.7152, 0.0722));
		float grainWeight = smoothstep(0.0, 0.08, luminance) * (1.0 - smoothstep(0.65, 1.0, luminance));
		display += FilmGrain(gl_FragCoord.xy, postFrame.sourceEncoding.y) *
			postFrame.cinema.z * grainWeight;
	}
	FragColor = vec4(postFrame.sourceEncoding.z > 0.5 ? max(display, vec3(0.0)) :
		clamp(display, vec3(0.0), vec3(1.0)), 1.0);
}
