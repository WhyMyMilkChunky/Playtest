#ifndef S3D_GAME_MODEL_RESPONSE_GLSL
#define S3D_GAME_MODEL_RESPONSE_GLSL

#ifndef S3D_MODEL_CUSTOM_REFLECTION_ACTIVE
#define S3D_MODEL_CUSTOM_REFLECTION_ACTIVE false
#endif

float PixelLightResponse(float value)
{
	float banded = floor(clamp(value, 0.0, 1.0) * 12.0 + 0.5) / 12.0;
	return mix(value, banded, 0.58);
}

vec3 ModelSurfaceReflection(vec3 lightColor, vec3 normalValue, vec3 tangentValue, vec3 bitangentValue,
    vec3 viewDirection, vec3 lightDirection, float strength, vec3 fastResponse, vec3 detailedResponse,
    float normalView, float viewMask)
{
	if (strength <= 0.0 || all(lessThanEqual(lightColor, vec3(0.0)))) return vec3(0.0);
#ifdef S3D_MODEL_CUSTOM_REFLECTION
	if (S3D_MODEL_CUSTOM_REFLECTION_ACTIVE)
		return S3D_MODEL_CUSTOM_REFLECTION(lightColor, normalValue, viewDirection, lightDirection, strength);
#endif
	if (u_fastSpecular != 0)
		return FastSurfaceReflection(
		    lightColor, normalValue, viewDirection, lightDirection, fastResponse, strength);
	return BeckmannReflection(lightColor, normalValue, tangentValue, bitangentValue, viewDirection,
	    lightDirection, detailedResponse, normalView, viewMask, strength);
}

vec3 ModelLightingResponse(vec3 albedo, vec3 N, vec3 viewDirection, vec3 lightingPosition,
    vec3 tangentHint, float specularLevel, float smoothness)
{
	float normalView = max(dot(N, viewDirection), 0.0);
	vec3 fastResponse = u_fastSpecular != 0 ? FastReflectionParameters(specularLevel, smoothness) : vec3(0.0);
	vec3 detailedResponse = u_fastSpecular == 0 ? BeckmannParameters(specularLevel, smoothness) : vec3(0.0);
	float reflectance = u_fastSpecular != 0 ? fastResponse.z : detailedResponse.z;
	vec3 tangentValue = vec3(0.0), bitangentValue = vec3(0.0);
	float viewMask = 1.0;
	if (u_fastSpecular == 0 && !S3D_MODEL_CUSTOM_REFLECTION_ACTIVE && u_specularStrength > 0.0)
	{
		mat3 specularFrame = SurfaceSpecularFrame(N, tangentHint);
		tangentValue = specularFrame[0];
		bitangentValue = specularFrame[1];
		viewMask += BeckmannLambda(viewDirection, tangentValue, bitangentValue, detailedResponse, normalView);
	}
	float roughness = SurfaceRoughness(smoothness);
	vec3 diffuseParameters = RelayDiffuseParameters(roughness, reflectance, u_specularStrength);
	vec3 worldUp = normalize(u_worldUp);
	float hemisphere = dot(N, worldUp) * 0.5 + 0.5;
	vec3 ambientField = vec3(0.045, 0.052, 0.072) + vec3(0.10, 0.12, 0.17) * hemisphere;

	vec3 sunDirection = normalize(u_sunDirection);
	vec3 sunColor = vec3(0.20, 0.18, 0.15);
	if (u_modelFxgiOnly != 0) sunColor = vec3(0.0);
	float sunDiffuse =
	    PixelLightResponse(RelayDiffuse(N, viewDirection, sunDirection, diffuseParameters, normalView));
	vec3 directDiffuse = albedo * sunColor * sunDiffuse;
	vec3 directReflection = ModelSurfaceReflection(sunColor, N, tangentValue, bitangentValue, viewDirection,
	    sunDirection, u_specularStrength, fastResponse, detailedResponse, normalView, viewMask);
	vec3 reflectionDirection = reflect(-viewDirection, N);
	float reflectedSky = dot(reflectionDirection, worldUp) * 0.5 + 0.5;
	vec3 environmentField = mix(u_environmentColor * 0.55, vec3(0.30, 0.39, 0.52), reflectedSky);
	if (u_modelFxgiOnly != 0) environmentField = vec3(0.0);

	for (int lightIndex = 0; lightIndex < u_lightCount; ++lightIndex)
	{
		vec4 lightParameters = ModelLightParameters(lightIndex);
		vec3 toLight = ModelLightPosition(lightIndex) - lightingPosition;
		float radius = lightParameters.x;
		float distanceSquared = dot(toLight, toLight);
		if (radius <= 0.0 || distanceSquared >= radius * radius) continue;
		// thin fibers accept backlighting; ordinary surfaces retain the early backface rejection.
		if (normalView <= 0.0 || (!S3D_MODEL_CUSTOM_REFLECTION_ACTIVE && dot(N, toLight) <= 0.0)) continue;
		float inverseDistance = inversesqrt(max(distanceSquared, 0.000001));
		float distanceToLight =
		    distanceSquared >= 0.000001 ? distanceSquared * inverseDistance : sqrt(distanceSquared);
		vec3 lightColor = ModelLightColor(lightIndex);
		vec3 lightDirection = toLight * inverseDistance;
		float falloff = 1.0 - distanceToLight / radius;
		float attenuation = falloff * falloff * lightParameters.y;
		float style = lightParameters.z;
		if (style > 0.5 && style < 2.5)
		{
			vec3 fromLight = -lightDirection;
			float coneCosine = lightParameters.w;
			float spot = smoothstep(coneCosine, min(coneCosine + 0.18, 0.995),
			    dot(fromLight, normalize(ModelLightDirection(lightIndex))));
			attenuation *= spot;
		}
		if (attenuation == 0.0) continue;
		float diffuseResponse =
		    PixelLightResponse(RelayDiffuse(N, viewDirection, lightDirection, diffuseParameters, normalView));
		directDiffuse += albedo * lightColor * attenuation * diffuseResponse * 0.92;
		directReflection +=
		    ModelSurfaceReflection(lightColor * attenuation, N, tangentValue, bitangentValue, viewDirection,
		        lightDirection, u_specularStrength, fastResponse, detailedResponse, normalView, viewMask);
	}

	vec3 reflectedLight =
	    CompressSurfaceReflection(directReflection + EnvironmentReflection(environmentField, normalView,
	                                                     reflectance, smoothness, u_specularStrength));
	vec3 ambientColor = albedo * ambientField * 1.62;
	if (u_modelFxgiOnly != 0) ambientColor = vec3(0.0);
	if (u_indirectRed.x >= 0.0)
	{
		vec4 basis = vec4(1.0, N);
		vec3 bounce =
		    max(vec3(dot(u_indirectRed, basis), dot(u_indirectGreen, basis), dot(u_indirectBlue, basis)),
		        vec3(0.0));
		ambientColor = sqrt(max(albedo * albedo * bounce * 1.62, vec3(0.0)));
	}
	vec3 color = ambientColor + directDiffuse * 1.62 + reflectedLight;
	return color;
}

#endif
