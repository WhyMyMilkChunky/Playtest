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
	vec2 flow = uv * 2.7 + vec2(shape.x, -shape.y * .65);
	float billow = Noise(flow + Noise(flow * .7 + shape.y * .3) * .8);
	float density = (1 - smoothstep(.12, 1, radial)) * (.3 + .7 * billow) * colorOpacity.a;
	if (density < .003) discard;
	vec3 tint = colorOpacity.rgb * mix(.72 + .48 * billow, .55 + .65 * (1 - radial), shape.z);
	color = vec4(tint * density, density);
}
