#version 460 core

#include "include/game_post.glsl"

layout(location = 0) out vec4 FragColor;

float MeterLogLuminance()
{
	float weights[32];
	float sums[32];
	for (int bin = 0; bin < 32; ++bin) { weights[bin] = 0.0; sums[bin] = 0.0; }
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

void main()
{
	float measured = MeterLogLuminance();
	vec4 previous = postFrame.texelModeHistory.w > 0.5 ?
		texelFetch(u_exposure, ivec2(0), 0) : vec4(1.0, measured, 0.0, 0.0);
	float meterWeight = 1.0 - exp(-postFrame.adaptation.x / 0.35);
	float meanLog = mix(previous.g, measured, meterWeight);
	float target = clamp(0.12 * exp2(postFrame.tuning.x) / max(exp2(meanLog), 0.004),
		postFrame.adaptation.z, postFrame.adaptation.w);
	float previousEv = log2(clamp(previous.r, postFrame.adaptation.z, postFrame.adaptation.w));
	float error = log2(target) - previousEv;
	// A tiny dead zone settles fluctuations; bright recovery is faster than dark adaptation.
	error = sign(error) * max(abs(error) - 0.025, 0.0);
	float seconds = postFrame.adaptation.y * (error < 0.0 ? 0.55 : 1.35);
	float weight = 1.0 - exp(-postFrame.adaptation.x / max(seconds, 0.01));
	float exposure = clamp(exp2(previousEv + error * weight),
		postFrame.adaptation.z, postFrame.adaptation.w);
	// Spare history channel: a bounded glare response to a broad brightness increase.
	// This is a global artistic response, not a local retinal afterimage simulation.
	float stimulus = postFrame.texelModeHistory.w > 0.5 ?
		smoothstep(0.10, 0.85, max(measured - previous.g, 0.0)) : 0.0;
	float recovery = max(stimulus, previous.b * exp(-postFrame.adaptation.x / 1.8));
	// Darkness builds gradually; bright areas release it quickly. No extra history texture.
	float darkTarget = 1.0 - smoothstep(-5.8, -3.1, meanLog);
	float darkSeconds = darkTarget > previous.a ? 8.0 : 1.2;
	float darkWeight = 1.0 - exp(-postFrame.adaptation.x / darkSeconds);
	float darkness = mix(previous.a, darkTarget, darkWeight);
	FragColor = vec4(exposure, meanLog, clamp(recovery, 0.0, 1.0), clamp(darkness, 0.0, 1.0));
}
