#ifndef GAME_SURFACE_AO_GLSL
#define GAME_SURFACE_AO_GLSL

float SurfaceBakedAo(samplerBuffer aoMap, int address, vec2 uv)
{
	int face = (address / 4) % 6;
	vec2 cornerUv = uv;
	if (face == 1 || face == 4) cornerUv = vec2(uv.y, 1.0 - uv.x);
	else if (face == 2) cornerUv = vec2(1.0 - uv.y, uv.x);
	else if (face == 3) cornerUv = vec2(1.0 - uv.x, 1.0 - uv.y);
	cornerUv = clamp(cornerUv, vec2(0.0), vec2(1.0));

	int base = (address / 4) * 4;
	float first = texelFetch(aoMap, base).r;
	float second = texelFetch(aoMap, base + 1).r;
	float third = texelFetch(aoMap, base + 2).r;
	float fourth = texelFetch(aoMap, base + 3).r;
	// Retain the original quad's two-triangle interpolation at a trimmed vertex.
	return cornerUv.x >= cornerUv.y ?
		first * (1.0 - cornerUv.x) + second * (cornerUv.x - cornerUv.y) + third * cornerUv.y :
		first * (1.0 - cornerUv.y) + third * cornerUv.x + fourth * (cornerUv.y - cornerUv.x);
}

#endif
