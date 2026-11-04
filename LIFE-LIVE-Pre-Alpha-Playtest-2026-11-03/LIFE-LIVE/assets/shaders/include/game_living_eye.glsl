#ifndef S3D_GAME_LIVING_EYE_GLSL
#define S3D_GAME_LIVING_EYE_GLSL

float RodLuminance(vec3 radiance)
{
	// a calibrated RGB proxy for broad lamp profiles, not spectral reconstruction.
	return max(dot(radiance, vec3(0.06, 0.74, 0.20)), 0.0);
}

vec3 LivingEyeWorldResponse(vec3 encodedColor, float rodEnergy)
{
	if (u_livingEye.x <= 0.0001 || rodEnergy < 0.0) return encodedColor;
	float photopic = max(dot(encodedColor * encodedColor, vec3(0.2126, 0.7152, 0.0722)), 0.0);
	if (photopic <= 0.000001) return encodedColor;
	float darkness =
	    u_livingEye.y < 0.5 ? texelFetch(u_eyeState0, ivec2(0), 0).a : texelFetch(u_eyeState1, ivec2(0), 0).a;
	float localDark = 1.0 - smoothstep(0.012, 0.10, photopic);
	float weight = clamp(u_livingEye.x * darkness * localDark, 0.0, 0.75);
	float baselineRod = max(RodLuminance(encodedColor * encodedColor), 0.000001);
	float ratio = clamp(rodEnergy / baselineRod, 0.35, 1.0);
	// the legacy world shader emits gamma-like values; preserve the linear brightness ratio.
	return encodedColor * sqrt(mix(1.0, ratio, weight));
}

#endif
