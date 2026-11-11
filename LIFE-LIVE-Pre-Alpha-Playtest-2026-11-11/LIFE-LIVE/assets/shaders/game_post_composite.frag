#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

vec3 FilmResponse(vec3 color)
{
	float strength = postFrame.cinema.x;
	float luminance = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	color *= 1.0 + strength * 0.12 * (luminance - 0.18) / (luminance + 0.18);
	float peak = max(color.r, max(color.g, color.b));
	float shoulder = mix(0.80, 0.65, strength);
	if (peak > shoulder && postFrame.sourceEncoding.z < 0.5)
		color *= (shoulder + (1.0 - shoulder) * (1.0 - exp(-(peak - shoulder) / (1.0 - shoulder)))) / peak;
	return color;
}

float FilmGrain(vec2 pixel, float frame)
{
	vec3 value = fract(vec3(pixel.xyx) * 0.1031 + frame * 0.017);
	value += dot(value, value.yzx + 33.33);
	return fract((value.x + value.y) * value.z) - 0.5;
}

vec3 TwilightPerception(vec3 scene, float exposure, float darkness)
{
	float luminance = max(dot(scene, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	float localDark = 1.0 - smoothstep(0.012, 0.10, luminance / max(exposure, 0.0001));
	float weight = postFrame.perception.x * darkness * localDark;
	float rod = max(dot(scene, vec3(0.06, 0.74, 0.20)), 0.0);
	float ratio = clamp(rod / max(luminance, 0.000001), 0.35, 2.0);
	float target = luminance * mix(1.0, ratio, weight);
	// the shared receptor response covers actors, weapons and fog too. black stays black.
	vec3 perceived = scene * target / max(luminance, 0.000001);
	return mix(perceived, vec3(target), weight * 0.85);
}

vec3 AdaptConeColor(vec3 color, float darkness)
{
	float strength = postFrame.perception.y * (1.0 - darkness * 0.70);
	if (strength <= 0.0001) return color;
	vec3 gains = texelFetch(u_exposure, ivec2(1, 0), 0).rgb;
	vec3 cones = EyeConeResponse(color) * mix(vec3(1.0), gains, strength * 0.80);
	vec3 adapted = max(EyeConeToRgb(cones), vec3(0.0));
	float before = dot(color, vec3(0.2126, 0.7152, 0.0722));
	float after = dot(adapted, vec3(0.2126, 0.7152, 0.0722));
	return adapted * before / max(after, 0.000001);
}

vec3 RetinalSensitivity(vec3 color, float meanLog)
{
	float strength = postFrame.perception.y;
	if (strength <= 0.0001) return color;
	vec2 meterUv = (uv - vec2(0.14, 0.22)) / vec2(0.72, 0.64);
	vec2 edge = min(meterUv, 1.0 - meterUv);
	float coverage = smoothstep(0.0, 0.15, min(edge.x, edge.y));
	vec2 response = textureLod(u_recovery, S3DFramebufferUv(meterUv), 0.0).rg;
	// broad, bounded sensitivity changes. no bright outline or colour snapshot survives a camera turn.
	float gain = exp2(clamp(meanLog - response.g, -1.0, 1.0) * strength * 0.18);
	return color * mix(1.0, gain * (1.0 - response.r * strength * 0.24), coverage);
}

vec3 RetinalScatter(vec3 scene, vec3 core, vec3 wide, float pupil)
{
	float fraction = postFrame.eye.x * (0.028 + pupil * 0.024);
	float aperture = smoothstep(0.68, 0.98, uv.y) * postFrame.eye.x * 0.08;
	// thresholded bloom is a low-cost optical proxy, not a normalized full-scene PSF.
	// the broad veil lowers nearby contrast; keep its weight bounded.
	return scene * (1.0 - fraction) + core * (1.0 - aperture) + wide * fraction * 5.0;
}

float FloaterShadow(vec2 sampleUv, float brightness, float detail, float pupil)
{
	if (postFrame.ocular.x <= 0.0001 || brightness <= 0.0001) return 0.0;
	vec2 point = sampleUv * vec2(postFrame.ocular.w, 1.0);
	float coverage = 0.0;
	int count = clamp(int(postFrame.ocular.z), 0, 3);
	for (int index = 0; index < 3; ++index)
	{
		if (index >= count) break;
		vec4 shape = postFrame.floaterShapes[index], motion = postFrame.floaterDetails[index];
		vec2 p = point - shape.xy;
		p = vec2(p.x * motion.x + p.y * motion.y, -p.x * motion.y + p.y * motion.x);
		vec2 local = p / max(shape.zw, vec2(0.001)) + 0.5;
		if (any(lessThan(local, vec2(0.0))) || any(greaterThan(local, vec2(1.0)))) continue;
		vec2 atlasUv = vec2((motion.w * 64.0 + 2.0 + local.x * 60.0) / 256.0, (2.0 + local.y * 60.0) / 64.0);
		coverage = max(coverage, textureLod(u_floaters, atlasUv, 0.0).r * motion.z);
	}
	vec2 center = (sampleUv - 0.5) * vec2(postFrame.ocular.w, 1.0);
	float aimingRoom = smoothstep(0.035, 0.12, length(center));
	float plainSurface = mix(1.0, 0.55, smoothstep(0.12, 0.65, detail));
	return postFrame.ocular.x * coverage * brightness * plainSurface * aimingRoom * mix(1.0, 0.65, pupil);
}

void main()
{
	vec4 state = postFrame.cinema.w > 0.5 ? texelFetch(u_exposure, ivec2(0), 0) : vec4(1.0, 0.0, 0.0, 0.0);
	float exposure = postFrame.tuning.w > 0.5 ? state.r : 1.0;
	vec3 scene = SceneLinear(texture(u_source, S3DFramebufferUv(uv)).rgb) * exposure;
	float luminance = max(dot(scene, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	// derivatives stay outside divergent floater bounds; no neighbour texture reads are needed.
	float detail = fwidth(luminance) / max(luminance, 0.025);
	float bright = smoothstep(0.035, 0.20, luminance);
	float floater = FloaterShadow(uv, bright, detail, state.b);
	scene = RetinalSensitivity(scene, state.g);
	scene = TwilightPerception(scene, exposure, state.a);

	vec3 core = vec3(0.0), wide = vec3(0.0);
	if (postFrame.tuning.y > 0.0) core = texture(u_bloom, S3DFramebufferUv(uv)).rgb * postFrame.tuning.y;
	if (postFrame.eye.x > 0.0) wide = texture(u_veil, S3DFramebufferUv(uv)).rgb;
	vec3 retinal = RetinalScatter(scene, core, wide, state.b);
	if (postFrame.lens.x > 0.0) retinal += texture(u_flare, S3DFramebufferUv(uv)).rgb * postFrame.lens.x;
	retinal *= 1.0 - clamp(floater, 0.0, 0.18);
	vec3 color = FilmResponse(AdaptConeColor(retinal, state.a));

	vec3 display = DisplayColor(color);
	if (postFrame.cinema.z > 0.0)
	{
		float value = dot(display, vec3(0.2126, 0.7152, 0.0722));
		float weight = smoothstep(0.0, 0.08, value) * (1.0 - smoothstep(0.65, 1.0, value));
		display += FilmGrain(gl_FragCoord.xy, postFrame.sourceEncoding.y) * postFrame.cinema.z * weight;
	}
	FragColor = vec4(
	    postFrame.sourceEncoding.z > 0.5 ? max(display, vec3(0.0)) : clamp(display, vec3(0.0), vec3(1.0)),
	    1.0);
}
