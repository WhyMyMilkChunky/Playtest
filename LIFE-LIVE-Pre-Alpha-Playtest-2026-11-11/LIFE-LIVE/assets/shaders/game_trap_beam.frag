#version 460 core
layout(location = 0) in vec2 uv;
layout(location = 1) flat in vec3 halo;
layout(location = 2) flat in vec3 core;
layout(location = 0) out vec4 color;

void main()
{
	float d = abs(uv.x), aa = min(fwidth(d), .12);
	float hot = 1.0 - smoothstep(.07, .18 + aa, d);
	float corona = exp2(-d * d * 13.0) * (1.0 - smoothstep(.7, 1.0, d));
	// only local beam pixels blend. no dark opaque ribbon and no extra screen-sized glow pass.
	color = vec4(core * hot + halo * corona * .65, 0);
}
