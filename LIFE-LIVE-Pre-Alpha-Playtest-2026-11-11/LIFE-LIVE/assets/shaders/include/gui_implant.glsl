float ImplantNoise(vec2 p)
{
	return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715))));
}

vec2 ImplantPosition(vec2 position, vec4 implant)
{
	return position;
}

#ifndef S3D_GUI_VERTEX
const float SONAR_SCATTER = 2.4;

float SonarStop(int ray)
{
	ray &= 63;
	return S3D_GUI_SONAR_STOPS[ray >> 2][ray & 3];
}

float SonarIllumination(vec2 position)
{
	if (S3D_GUI_SONAR_ROWS[1].w <= 0) return 1.0;
	vec3 p = vec3(position, 1);
	float w = dot(S3D_GUI_SONAR_ROWS[2].xyz, p);
	if (abs(w) < .000001) return .8;
	vec2 local = vec2(dot(S3D_GUI_SONAR_ROWS[0].xyz, p), dot(S3D_GUI_SONAR_ROWS[1].xyz, p)) / w;
	float distance = length(local);
	if (distance > S3D_GUI_SONAR_ROWS[2].w) return .8;
	// the cached rays use diamond coordinates too, avoiding an atan for every map pixel.
	float u = abs(local.y) / max(abs(local.x) + abs(local.y), .0001);
	float sector = (local.x >= 0 ? (local.y >= 0 ? u : 4.0 - u) : (local.y >= 0 ? 2.0 - u : 2.0 + u)) * 16.0;
	int ray = int(floor(sector));
	float a = SonarStop(ray), b = SonarStop(ray + 1);
	float stop = abs(a - b) > 6.0 ? min(a, b) : mix(a, b, fract(sector));
	if (distance > stop + .15) return .8;
	float age = S3D_GUI_SONAR_ROWS[0].w - distance;
	float front = (1.0 - smoothstep(.25, .9, -age)) * (1.0 - smoothstep(0.0, 5.0, age));
	return .8 + .9 * front;
}

uint SonarBits(ivec2 pixel, uint seed)
{
	uint value = uint(pixel.x) * 0x9e3779b9u ^ uint(pixel.y) * 0x85ebca6bu ^ seed * 0xc2b2ae35u;
	value ^= value >> 16;
	value *= 0x7feb352du;
	value ^= value >> 15;
	value *= 0x846ca68bu;
	value ^= value >> 16;
	return value;
}

float SonarNoise(ivec2 pixel, uint seed)
{
	return float(SonarBits(pixel, seed) >> 8) * (1.0 / 16777216.0);
}

vec2 SonarNeighbour(vec2 position, uint tick)
{
	ivec2 pixel = ivec2(floor(position / SONAR_SCATTER));
	ivec2 original = pixel;
	// paired exchanges move the return itself; they're not another brightness mask over the map.
	int stagger = int(SonarBits(ivec2(0, pixel.y), 17u) >> 31);
	int pair = (pixel.x + stagger) >> 1;
	if ((SonarBits(ivec2(pair, pixel.y), tick + 31u) >> 8) > 10737418u)
		pixel.x += ((pixel.x + stagger) & 1) == 0 ? 1 : -1;
	stagger = int(SonarBits(ivec2(pixel.x, 0), 43u) >> 31);
	pair = (pixel.y + stagger) >> 1;
	if ((SonarBits(ivec2(pixel.x, pair), tick + 79u) >> 8) > 13086228u)
		pixel.y += ((pixel.y + stagger) & 1) == 0 ? 1 : -1;
	return position + vec2(pixel - original) * SONAR_SCATTER;
}

vec4 SonarDisplay(vec4 tint, vec2 position, vec4 implant)
{
	if (implant.x <= 0) return tint;
	ivec2 pixel = ivec2(floor(position));
	float grain = SonarNoise(pixel, 151u);
	float flicker = SonarNoise(pixel, uint(S3D_GUI_RASTER.w) + 197u);
	float returnSignal = .79 + grain * .24 + flicker * .15;
	return vec4(tint.rgb * returnSignal * SonarIllumination(position), tint.a * (.84 + grain * .16));
}

vec4 SonarSurface(vec4 tint, vec2 encoded, vec2 position, vec4 implant)
{
	int openEdges = int(floor((-encoded.x + 4.0) / 16.0));
	vec2 barycentric = encoded + float(8 + 16 * openEdges);
	vec2 offset = vec2(0), source = barycentric;
	if (implant.x > 0)
	{
		vec2 dx = dFdx(barycentric) * S3D_GUI_RASTER.x;
		vec2 dy = dFdy(barycentric) * S3D_GUI_RASTER.y;
		float gradient = max(max(abs(dx.x) + abs(dy.x), abs(dx.y) + abs(dy.y)),
			abs(dx.x + dx.y) + abs(dy.x + dy.y));
		// keep very thin wall caps legible rather than expanding an acute triangle across half the display.
		float reach = implant.x * min(1.0, .95 / max(gradient * SONAR_SCATTER, .0001));
		vec3 margins = vec3(abs(dx) + abs(dy), abs(dx.x + dx.y) + abs(dy.x + dy.y)) * (SONAR_SCATTER * reach);
		if (any(lessThan(vec3(barycentric, 1.0 - barycentric.x - barycentric.y), -margins - .00001))) discard;
		offset = (SonarNeighbour(position, uint(S3D_GUI_RASTER.z)) - position) * reach;
		source += dx * offset.x + dy * offset.y;
	}
	if (min(min(source.x, source.y), 1.0 - source.x - source.y) < -.00001) discard;
	// each shared edge belongs to one triangle, including on translucent upper floors.
	if (((openEdges & 1) != 0 && source.x <= .00001) ||
		((openEdges & 2) != 0 && source.y <= .00001) ||
		((openEdges & 4) != 0 && 1.0 - source.x - source.y <= .00001)) discard;
	return SonarDisplay(tint, position + offset, implant);
}

vec4 ImplantDisplay(sampler2D displayTexture, vec2 uv, vec4 tint, vec2 position, vec4 implant)
{
	if (uv.x < -4.0 && uv.y < -4.0) return SonarSurface(tint, uv, position, implant);
	vec2 dx = dFdx(uv), dy = dFdy(uv);
	float disruption = implant.x * implant.w;
	float tick = floor(implant.y * 36.0);
	float band = floor(position.y / 14.0);
	float interference = ImplantNoise(vec2(band, tick));
	vec4 source = texture(displayTexture, uv);
	vec4 result = source * tint;
	if (implant.x <= 0.0) return result;

	// a quiet stationary raster. no pixel grid, panel circuitry or brightness lift.
	float raster = .92 + .08 * sin(position.y * 3.14159265);
	result.rgb *= mix(1.0, raster, implant.x);
	if (dot(abs(dx) + abs(dy), vec2(1)) > .000001)
	{
		vec2 nearOffset = dx * .7 + dy * .25;
		vec2 wideOffset = (dx + dy) * 1.8;
		float left = texture(displayTexture, uv + nearOffset).a;
		float right = texture(displayTexture, uv - nearOffset).a;
		float wide = (texture(displayTexture, uv + wideOffset).a +
			texture(displayTexture, uv - wideOffset).a) * .5;
		float glow = (max(left, right) * .23 + wide * .14) * (1.0 - source.a);
		result.a = min(tint.a, result.a + glow * tint.a * implant.x);
		result.rgb += vec3(left - source.a, 0, right - source.a) * (.055 + disruption * .3);
	}
	// damage briefly breaks up the signal, then the original image comes straight back.
	float dropout = step(.83, interference) * disruption;
	result.a *= 1.0 - dropout * .7;
	result.rgb *= 1.0 + disruption * (interference - .5) * .45;
	result.rgb *= SonarIllumination(position);
	return max(result, vec4(0));
}
#endif
