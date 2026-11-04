#version 460 core

layout(location = 0) in vec2 flowUv;
layout(location = 1) flat in vec4 colorTime;
layout(location = 2) flat in float seed;
layout(location = 0) out vec4 FragColor;

float Hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float Crust(vec2 p)
{
	vec2 cell = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(Hash(cell), Hash(cell + vec2(1, 0)), f.x),
	    mix(Hash(cell + vec2(0, 1)), Hash(cell + vec2(1, 1)), f.x), f.y);
}
void main()
{
	// world-sized pixels match the nearby grilles; the flow moves underneath that pixel grid.
	vec2 p = floor(flowUv * 24.0) / 24.0;
	p.y -= colorTime.w;
	float crust = Crust(p * vec2(1.8, .8));
	float seams = smoothstep(.43, .50, crust) * (1.0 - smoothstep(.54, .65, crust));
	vec3 cold = vec3(.055, .025, .016) * (.7 + crust);
	vec3 hot = colorTime.rgb * (.55 + .45 * sin(p.y * 2.0 + p.x + seed));
	FragColor = vec4(mix(cold, hot, clamp(seams + smoothstep(.72, .9, crust), 0.0, 1.0)), 1);
}
