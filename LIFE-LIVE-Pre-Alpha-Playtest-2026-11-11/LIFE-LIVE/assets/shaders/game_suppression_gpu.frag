#version 460 core

#include "include/s3d_backend.glsl"

S3D_RESOURCE(0, 0) uniform SuppressionFrame
{
	vec4 texelAmountHit;
	vec4 direction;
	vec4 trap;
	vec4 shock;
}
effect;
S3D_RESOURCE(0, 1) uniform sampler2D sceneTexture;
S3D_RESOURCE(0, 2) uniform sampler2D historyTexture;

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 fragmentColor;

void main()
{
	vec2 centered = uv * 2.0 - 1.0;
	vec2 fromCenter = abs(centered);
	float edge = smoothstep(0.30, 1.0, max(fromCenter.x, fromCenter.y));
	float directionalEdge = 0.0;
	if (effect.direction.z > 0.0)
	{
		vec2 edgeDirection = normalize(centered + vec2(0.0001));
		float directionalResponse =
		    max(dot(edgeDirection, normalize(effect.direction.xy + vec2(0.0001))), 0.0);
		float directionalSquared = directionalResponse * directionalResponse;
		directionalEdge = directionalSquared * directionalSquared * edge;
	}
	float suppressionBlur = edge * smoothstep(0.0, 1.0, effect.texelAmountHit.z);
	float hitShockBlur = max(effect.texelAmountHit.w * 0.72, max(effect.trap.y, effect.shock.x * .62));
	float blurAmount =
	    clamp(max(suppressionBlur, hitShockBlur + directionalEdge * effect.direction.z * 0.62), 0.0, 1.0);
	float effectStrength = max(effect.trap.y, max(effect.texelAmountHit.z, max(effect.texelAmountHit.w, effect.direction.z)));
	vec2 radius = effect.texelAmountHit.xy * mix(3.0, 23.0, effectStrength) *
	              max(blurAmount, effect.texelAmountHit.w * 0.62);
	float pixelScale = clamp(1.0 / (effect.texelAmountHit.y * 1080.0), .5, 3.0);
	radius = max(radius, effect.texelAmountHit.xy * pixelScale * (effect.trap.y * 72.0 + effect.shock.x * 15.0));

	vec2 tremor = vec2(sin(effect.shock.y * 87.0), cos(effect.shock.y * 103.0)) * effect.shock.x;
	vec2 shockUv = clamp(uv + centered * effect.shock.z * .038 + tremor * .003, vec2(0), vec2(1));
	vec3 sharp = texture(sceneTexture, S3DFramebufferUv(shockUv)).rgb;
	vec3 color = sharp;
	if (blurAmount > .01)
	{
		vec3 blurred = sharp * 4.0;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv + vec2(radius.x, 0.0))).rgb * 2.0;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv - vec2(radius.x, 0.0))).rgb * 2.0;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv + vec2(0.0, radius.y))).rgb * 2.0;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv - vec2(0.0, radius.y))).rgb * 2.0;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv + radius)).rgb;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv - radius)).rgb;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv + vec2(radius.x, -radius.y))).rgb;
		blurred += texture(sceneTexture, S3DFramebufferUv(shockUv + vec2(-radius.x, radius.y))).rgb;
		float weight = 16.0;
		if (effect.trap.y > .15)
		{
			const vec2 disk[8] = vec2[8](vec2(.31, .65), vec2(-.43, .52), vec2(.68, -.25), vec2(-.61, -.38),
			    vec2(.15, -.68), vec2(-.21, .14), vec2(.48, .13), vec2(-.12, -.39));
			for (int tap = 0; tap < 8; ++tap)
				blurred += texture(sceneTexture, S3DFramebufferUv(shockUv + radius * disk[tap])).rgb;
			weight += 8.0;
		}
		blurred /= weight;
		float mixAmount = clamp(blurAmount * (0.40 + effectStrength * 0.58), 0.0, 0.92);
		float blastMix = smoothstep(.025, .25, effect.trap.y);
		color = mix(sharp, blurred, max(mixAmount, blastMix));
	}
	if (effect.shock.x > .01)
	{
		vec2 split = centered * (.009 * effect.shock.z + .003 * effect.shock.x);
		vec3 fringe = vec3(texture(sceneTexture, S3DFramebufferUv(shockUv + split)).r, sharp.g,
		    texture(sceneTexture, S3DFramebufferUv(shockUv - split)).b);
		color = mix(color, fringe, .18 * effect.shock.x * (1.0 - effect.trap.y));
	}
	if (effect.shock.x > .015 && effect.shock.w > .5)
	{
		vec2 trailUv = clamp(uv + tremor * .008 + centered * .004, vec2(0), vec2(1));
		vec3 ghost = texture(historyTexture, S3DFramebufferUv(trailUv)).rgb;
		color = mix(color, min(ghost, vec3(6)), effect.shock.x * .58);
	}
	float concussion = effect.trap.y;
	float sceneLuma = dot(color, vec3(.2126, .7152, .0722));
	color = mix(color, vec3(sceneLuma), concussion * .42);
	color *= 1.0 - edge * concussion * .38;
	color += vec3(.10, .22, .38) * effect.shock.x * (.5 + .5 * sin(effect.shock.y * 97.0));
	if (effect.texelAmountHit.z > 0.0)
	{
		float edgePressure = edge * effect.texelAmountHit.z;
		float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
		color = mix(color, vec3(luminance), edgePressure * 0.16);
		color *= 1.0 - edgePressure * 0.10;
		float vignetteRadius = length(centered * vec2(0.78, 1.0));
		float vignette = smoothstep(0.34, 1.18, vignetteRadius) * effect.texelAmountHit.z;
		color *= 1.0 - vignette * 0.32;
	}
	float directionalPressure = directionalEdge * effect.direction.z;
	color = mix(color, vec3(0.72, 0.018, 0.012), directionalPressure * 0.46);
	float electric = clamp(effect.trap.z, 0.0, 1.0);
	color *= mix(vec3(1), vec3(.88, 1.015, 1.14), electric * .28);
	color += vec3(.025, .055, .13) * electric * effect.trap.w;
	color = mix(color, vec3(4.5, 3.6, 2.3), clamp(effect.trap.x * .9, 0.0, .9));
	fragmentColor = vec4(color, 1.0);
}
