#version 460 core

#include "include/game_post.glsl"

layout(location = 0) out vec4 FragColor;

float MeterLogLuminance()
{
	float weights[32];
	float sums[32];
	for (int bin = 0; bin < 32; ++bin)
	{
		weights[bin] = 0.0;
		sums[bin] = 0.0;
	}
	float total = 0.0;
	for (int y = 0; y < 16; ++y)
		for (int x = 0; x < 16; ++x)
		{
			vec2 offset = (vec2(x, y) + 0.5) / 16.0 - 0.5;
			float weight = 0.25 + 0.75 * exp(-dot(offset, offset) * 12.0);
			float value = clamp(texelFetch(u_source, ivec2(x, y), 0).r, -8.0, 0.0);
			int bin = clamp(int((value + 8.0) * 4.0), 0, 31);
			weights[bin] += weight;
			sums[bin] += value * weight;
			total += weight;
		}
	// Trim very dark pixels and the brightest tail, so small lamps/flashes do not pump exposure.
	float lower = total * 0.15, upper = total * 0.90;
	float walked = 0.0, retained = 0.0, meanLog = 0.0;
	for (int bin = 0; bin < 32; ++bin)
	{
		float accepted = max(0.0, min(walked + weights[bin], upper) - max(walked, lower));
		meanLog += sums[bin] * accepted / max(weights[bin], 0.0001);
		retained += accepted;
		walked += weights[bin];
	}
	return meanLog / max(retained, 0.0001);
}

vec3 AdaptCones()
{
	if (postFrame.perception.y <= 0.0001) return vec3(1.0);
	vec3 total = vec3(0.0);
	float weights = 0.0;
	for (int y = 1; y < 16; y += 2)
		for (int x = 1; x < 16; x += 2)
		{
			vec4 meterValue = texelFetch(u_source, ivec2(x, y), 0);
			float luminance = exp2(meterValue.r);
			float weight = smoothstep(0.006, 0.06, luminance) * (1.0 - smoothstep(0.35, 0.85, luminance));
			total += meterValue.gba * weight;
			weights += weight;
		}
	vec3 average = weights > 0.0001 ? total / weights : vec3(1.0);
	vec3 target = clamp(1.0 / max(average, vec3(0.25)), vec3(0.85), vec3(1.18));
	vec3 previous =
	    postFrame.texelModeHistory.w > 0.5 ? texelFetch(u_exposure, ivec2(1, 0), 0).rgb : vec3(1.0);
	vec3 seconds = mix(vec3(2.0), vec3(6.0), step(abs(previous - 1.0), abs(target - 1.0)));
	return mix(previous, target, 1.0 - exp(-postFrame.adaptation.x / seconds));
}

vec2 RecoverSensitivity()
{
	ivec2 pixel = ivec2(gl_FragCoord.xy);
	ivec2 limit = textureSize(u_source, 0) - 1;
	float light = exp2(texelFetch(u_source, pixel, 0).r) * 0.40;
	const ivec2 offsets[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
	for (int i = 0; i < 4; ++i)
		light += exp2(texelFetch(u_source, clamp(pixel + offsets[i], ivec2(0), limit), 0).r) * 0.15;
	float surround = log2(max(light, 0.004));
	vec2 previous =
	    postFrame.texelModeHistory.w > 0.5 ? texelFetch(u_exposure, pixel, 0).rg : vec2(0.0, surround);
	float target = smoothstep(0.16, 0.70, light);
	float seconds = target > previous.r ? 0.65 : 2.8;
	return mix(previous, vec2(target, surround), 1.0 - exp(-postFrame.adaptation.x / vec2(seconds, 0.18)));
}

void main()
{
	if (postFrame.texelModeHistory.z > 4.5)
	{
		FragColor = vec4(RecoverSensitivity(), 0.0, 1.0);
		return;
	}
	// a second state texel holds three independent cone gains without another pass.
	if (gl_FragCoord.x > 1.0)
	{
		FragColor = vec4(AdaptCones(), 0.0);
		return;
	}
	float measured = MeterLogLuminance();
	vec4 previous = postFrame.texelModeHistory.w > 0.5 ? texelFetch(u_exposure, ivec2(0), 0)
	                                                   : vec4(1.0, measured, 0.0, 0.0);
	float meterWeight = 1.0 - exp(-postFrame.adaptation.x / 0.35);
	float meanLog = mix(previous.g, measured, meterWeight);
	float target = clamp(0.12 * exp2(postFrame.tuning.x) / max(exp2(meanLog), 0.004), postFrame.adaptation.z,
	    postFrame.adaptation.w);
	float previousEv = log2(clamp(previous.r, postFrame.adaptation.z, postFrame.adaptation.w));
	float error = log2(target) - previousEv;
	// A tiny dead zone settles fluctuations; bright recovery is faster than dark adaptation.
	error = sign(error) * max(abs(error) - 0.025, 0.0);
	float seconds = postFrame.adaptation.y * (error < 0.0 ? 0.55 : 1.35);
	float weight = 1.0 - exp(-postFrame.adaptation.x / max(seconds, 0.01));
	float exposure = postFrame.tuning.w > 0.5 ? clamp(exp2(previousEv + error * weight),
	                                                postFrame.adaptation.z, postFrame.adaptation.w)
	                                          : 1.0;
	// pupil movement and dark adaptation have different time scales. no image history is needed.
	float pupilTarget = 1.0 - smoothstep(-6.2, -1.3, meanLog);
	float pupilSeconds = pupilTarget > previous.b ? 0.65 : 0.22;
	float pupil = mix(previous.b, pupilTarget, 1.0 - exp(-postFrame.adaptation.x / pupilSeconds));
	float darkTarget = 1.0 - smoothstep(-5.8, -3.1, meanLog);
	float darkSeconds = darkTarget > previous.a ? 12.0 : 1.2;
	float darkWeight = 1.0 - exp(-postFrame.adaptation.x / darkSeconds);
	float darkness = mix(previous.a, darkTarget, darkWeight);
	FragColor = vec4(exposure, meanLog, clamp(pupil, 0.0, 1.0), clamp(darkness, 0.0, 1.0));
}
