#version 460 core

layout(location = 0) in vec2 flowUv;
layout(location = 1) flat in vec4 colorTime;
layout(location = 2) flat in float seed;
layout(location = 0) out vec4 FragColor;

vec2 Hash(vec2 p)
{
	vec3 h = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973) + seed);
	h += dot(h, h.yzx + 33.33);
	return fract((h.xx + h.yz) * h.zy);
}
float Rock(vec2 p)
{
	vec2 cell = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(Hash(cell).x, Hash(cell + vec2(1, 0)).x, f.x),
	    mix(Hash(cell + vec2(0, 1)).x, Hash(cell + 1).x, f.x), f.y);
}
vec2 Plates(vec2 p)
{
	vec2 cell = floor(p), f = fract(p);
	float first = 10, second = 10;
	for (int y = -1; y <= 1; ++y)
		for (int x = -1; x <= 1; ++x)
		{
			vec2 at = vec2(x, y);
			vec2 d = at + .15 + Hash(cell + at) * .7 - f;
			float distance = dot(d, d);
			second = min(second, max(first, distance));
			first = min(first, distance);
		}
	return vec2(sqrt(first), sqrt(second) - sqrt(first));
}
void main()
{
	// crust plates drift over a slower hot current. distant cracks soften instead of sparkling.
	float footprint = max(length(dFdx(flowUv)), length(dFdy(flowUv)));
	vec2 p = mix(floor(flowUv * 24.0) / 24.0, flowUv, smoothstep(.035, .12, footprint));
	float time = colorTime.w;
	vec2 drift = p * vec2(.42, .34) - vec2(time * .10, time * .23);
	drift += vec2(Rock(drift * .38 + time * .025), Rock(drift * .38 + 17.0)) * .55;
	vec2 plate = Plates(drift);
	float width = .065 + .035 * sin(time * .6 + Rock(p * .08) * 8);
	float aa = max(.016, footprint * .35);
	float fissure = 1.0 - smoothstep(width - aa, width + aa, plate.y);
	float glow = 1.0 - smoothstep(width, width + .17, plate.y);
	float rock = Rock(p * 2.7 - vec2(time * .04, time * .08));
	float current = Rock(p * .8 - vec2(time * .17, time * .47));
	vec3 crust = mix(vec3(.024, .019, .018), vec3(.12, .064, .038), rock);
	crust += colorTime.rgb * glow * .11;
	vec3 molten = mix(colorTime.rgb * .65, vec3(2.9, 1.15, .16), current * .78);
	float core = 1.0 - smoothstep(.008, .032 + aa, plate.y);
	FragColor = vec4(mix(crust, molten, fissure) + vec3(1.1, .55, .08) * core, 1);
}
