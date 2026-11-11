#version 460 core
layout(location = 0) in vec2 uv;
layout(location = 1) flat in vec4 colorOpacity;
layout(location = 2) flat in vec4 shape;
layout(location = 0) out vec4 color;

float Hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float Noise(vec2 p)
{
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3 - 2 * f);
	return mix(mix(Hash(i), Hash(i + vec2(1, 0)), f.x), mix(Hash(i + vec2(0, 1)), Hash(i + 1), f.x), f.y);
}
void main()
{
	float radial = dot(uv, uv);
	if (radial >= 1) discard;
	if (shape.w > 1.5 && shape.w < 4.5)
	{
		float profile = 1 - smoothstep(.08, 1, radial);
		if (shape.w > 3.5)
			profile *= 1 - smoothstep(.08, .36, abs(uv.x));
		float opacity = profile * colorOpacity.a;
		if (opacity < .003) discard;
		color = vec4(colorOpacity.rgb * opacity, opacity);
		return;
	}
	if (shape.w > 4.5 && shape.w < 5.5)
	{
		vec2 pixel = floor(uv * 24) / 24;
		float turbulence = Noise(pixel * vec2(4, 2) + vec2(shape.x * 3.7, -shape.y * 36));
		float width = mix(.85, .18, uv.y * .5 + .5) * (.7 + turbulence * .3);
		float core = 1 - smoothstep(.03, width, abs(uv.x));
		float opacity = core * (1 - smoothstep(.18, 1, radial)) * colorOpacity.a;
		if (opacity < .003) discard;
		vec3 hot = mix(colorOpacity.rgb, vec3(8, 6.5, 4), core * core * .7);
		color = vec4(hot * opacity, opacity);
		return;
	}
	// quantized billows keep vapour in the same low-res language as the room textures.
	vec2 sampleUv = shape.w > .5 ? floor(uv * 20) / 20 : uv;
	vec2 flow = sampleUv * 2.7 + vec2(shape.x, -shape.y * .65);
	float billow = Noise(flow + Noise(flow * .7 + shape.y * .3) * .8);
	float density = (1 - smoothstep(.12, 1, radial)) * (.3 + .7 * billow) * colorOpacity.a;
	if (density < .003) discard;
	float hot = shape.w < .5 ? shape.z : 0;
	vec3 tint = colorOpacity.rgb * mix(.72 + .48 * billow, .55 + .65 * (1 - radial), hot);
	color = vec4(tint * density, density);
}
