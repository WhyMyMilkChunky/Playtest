#ifndef S3D_GAME_SPIDER_FUR_GLSL
#define S3D_GAME_SPIDER_FUR_GLSL

float SpiderFurHash(vec2 cell)
{
	vec3 value = fract(vec3(cell.xyx) * .1031);
	value += dot(value, value.yzx + 33.33);
	return fract((value.x + value.y) * value.z);
}

float SpiderUndercoat(vec2 uv, vec2 uvDx, vec2 uvDy)
{
	const vec2 density = vec2(64.0, 64.0);
	vec2 pixel = floor(uv * density);
	vec2 cell = vec2(pixel.x, floor(pixel.y * .25));
	float seed = SpiderFurHash(mod(cell, vec2(64.0, 16.0)));
	float footprint = max(length(uvDx * density), length(uvDy * density));
	float stroke = seed > .45 ? mix(.72, 1.08, mod(pixel.y, 4.0) / 3.0) : .86;
	return mix(stroke, .88, smoothstep(.8, 2.0, footprint));
}

vec3 SpiderFurRandom(vec2 cell)
{
	ivec2 address = ivec2(mod(cell, vec2(32.0, 48.0)));
	int bone = int(floor(furParameters.w + .5));
	address = (address + ivec2(bone * 11, bone * 23)) % ivec2(64);
	// the tiny noise layer is made once with the material, shared by all shells and fins.
	return texelFetch(u_cuticle, ivec3(address, 4), 0).rgb;
}

vec3 SpiderFurRoot(vec2 cell, vec2 pixel, float layer, float rim)
{
	vec3 random = SpiderFurRandom(cell);
	float selection = fract(random.z * 17.17);
	if (random.z < .08 || selection >= furSettings.x || fract(random.y * 13.13) >= rim)
		return vec3(2.0, 0.0, 0.0);
	float height = mix(.45, 1.0, random.z);
	if (layer >= height) return vec3(2.0, 0.0, 0.0);

	vec2 lean = (fract(random.xy * vec2(7.13, 5.73)) - .5) * (.35 * layer * layer);
	vec2 root = cell + .08 + random.xy * .84 + lean;
	vec2 delta = pixel - root;
	vec2 axis = random.xy - .5;
	axis = dot(axis, axis) > .00001 ? normalize(axis) : vec2(1, 0);
	delta = vec2(dot(delta, axis), dot(delta, vec2(-axis.y, axis.x))) * vec2(.82, 1.18);
	float radius = mix(.50, .65, fract(random.z * 5.73)) * (1.0 - .78 * layer / height);
	float grain = floor(fract(random.x * 9.71) * 4.0) / 3.0;
	return vec3(dot(delta, delta) / (radius * radius), mix(.78, 1.13, grain), random.z);
}

vec3 SpiderFurSample(vec2 uv, float layer, bool fin, float facing)
{
	vec2 coordinate = uv * vec2(32.0, 48.0);
	vec2 pixel = (floor(coordinate * 4.0) + .5) / 4.0;
	vec2 first = floor(pixel - .5);
	float rim = fin ? 1.0 - smoothstep(.10, .55, facing) : 1.0;
	vec3 nearest = vec3(2.0, 0.0, 0.0);
	// neighbouring roots can cross their cells, so the jitter doesn't get clipped back into neat rows.
	for (int y = 0; y < 2; ++y)
		for (int x = 0; x < 2; ++x)
		{
			vec3 root = SpiderFurRoot(first + vec2(x, y), pixel, layer, rim);
			if (root.x < nearest.x) nearest = root;
		}
	float shadow = 1.0 - furSettings.w * (1.0 - layer) * (1.0 - layer);
	return vec3(nearest.x <= 1.0 ? 1.0 : 0.0, nearest.y * shadow, nearest.z);
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
	primary = floor(primary * 6.0 + .5) / 6.0;
	float facing = dot(normalValue, lightDirection);
	vec3 reflection = vec3(.70, .73, .78) * (primary * .085 + broad * .012) * max(facing, 0.0);
	return lightColor * reflection * max(strength, 0.0);
}

vec3 SpiderFurTransmission(vec3 albedo, vec3 normalValue, vec3 viewDirection,
    vec3 lightDirection, vec3 lightColor)
{
	float normalLight = dot(normalValue, lightDirection);
	float backlight = max(-normalLight, 0.0);
	float forwardScatter = max(dot(-lightDirection, viewDirection), 0.0);
	forwardScatter *= forwardScatter;
	forwardScatter *= forwardScatter;
	float thinness = mix(.10, 1.0, furParameters.x * furParameters.x);
	float silhouette = 1.0 - smoothstep(.12, .70, abs(dot(normalize(normalView), viewDirection)));
	float wrap = max((normalLight + .30) / 1.30, 0.0) - max(normalLight, 0.0);
	float response = silhouette * thinness * (backlight * .35 + forwardScatter * .65) + wrap * .12;
	vec3 tint = mix(albedo, vec3(.105, .082, .071), .25);
	return lightColor * tint * (response * furSettings.z);
}

#endif
