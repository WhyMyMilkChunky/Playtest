#ifndef S3D_GAME_SPIDER_FUR_GLSL
#define S3D_GAME_SPIDER_FUR_GLSL

float SpiderFurHash(vec2 cell)
{
	vec3 value = fract(vec3(cell.xyx) * .1031);
	value += dot(value, value.yzx + 33.33);
	return fract((value.x + value.y) * value.z);
}

vec2 SpiderFurCoverage(vec2 uv, vec2 uvDx, vec2 uvDy, float layer, float region)
{
	const vec2 density = vec2(48.0, 64.0);
	vec2 coordinate = uv * density;
	vec2 cell = floor(coordinate);
	vec2 wrappedCell = mod(cell, density);
	float seed = SpiderFurHash(wrappedCell);
	float footprint = max(length(uvDx * density), length(uvDy * density));
	float resolved = 1.0 - smoothstep(.45, 1.5, footprint);
	float height = mix(.55, 1.0, seed) * region * resolved;
	if (layer >= height) return vec2(0.0);

	// quantize in the coat's own coordinates so the pixel pattern follows the legs.
	vec2 pixel = (floor(coordinate * 6.0) + .5) / 6.0;
	vec2 root = .5 + vec2(seed - .5, SpiderFurHash(wrappedCell + 71.0) - .5) * .22;
	vec2 delta = pixel - cell - root;
	float radius = mix(.50, .055, layer / max(height, .001));
	float coverage = 1.0 - smoothstep(radius * radius - .012, radius * radius + .012, dot(delta, delta));
	float shade = mix(.72, 1.24, SpiderFurHash(wrappedCell + 19.0)) * mix(.42, 1.12, layer);
	return vec2(coverage, shade);
}

vec3 SpiderFurReflection(vec3 lightColor, vec3 normalValue, vec3 viewDirection,
    vec3 lightDirection, float strength)
{
	vec3 tangentValue = normalize(tangentView);
	vec3 halfVector = viewDirection + lightDirection;
	halfVector *= inversesqrt(max(dot(halfVector, halfVector), .000001));
	float alignment = dot(tangentValue, halfVector);
	float lobe = max(1.0 - alignment * alignment, 0.0);
	float broad = lobe * lobe;
	float primary = broad * broad;
	primary *= primary;
	if (u_fastSpecular == 0) primary *= primary;
	primary = floor(primary * 8.0 + .5) / 8.0;
	float facing = dot(normalValue, lightDirection);
	vec3 reflection = vec3(.78, .66, .51) * (primary * .075 + broad * .012) * max(facing, 0.0);
	vec3 transmission = vec3(.040, .023, .012) * max(-facing, 0.0) * furParameters.x * furParameters.x;
	return lightColor * (reflection + transmission) * max(strength, 0.0);
}

#endif
