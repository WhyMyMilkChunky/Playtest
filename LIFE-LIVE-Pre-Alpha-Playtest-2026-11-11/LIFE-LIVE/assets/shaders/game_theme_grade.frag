#version 460 core

#include "include/game_post.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;

vec3 GradeLookup(vec3 color)
{
	vec3 position = clamp(color, vec3(0.0), vec3(1.0)) * 15.0;
	float first = floor(position.b), second = min(first + 1.0, 15.0);
	float row = clamp(postFrame.grading.x, 0.0, 2.0) * 16.0 + position.g + 0.5;
	vec2 firstUv = vec2(first * 16.0 + position.r + 0.5, row) / vec2(256.0, 48.0);
	vec2 secondUv = vec2(second * 16.0 + position.r + 0.5, row) / vec2(256.0, 48.0);
	// the LUT is data, so only the captured framebuffer uses the backend's Y conversion.
	return mix(textureLod(u_gradeLut, firstUv, 0.0).rgb, textureLod(u_gradeLut, secondUv, 0.0).rgb,
	    fract(position.b));
}

float FrostHash(vec2 point)
{
	vec3 value = fract(vec3(point.xyx) * .1031);
	value += dot(value, value.yzx + 33.33);
	return fract((value.x + value.y) * value.z);
}

float FrostField(vec2 point)
{
	vec2 cell = floor(point), blend = fract(point);
	blend = blend * blend * (3.0 - 2.0 * blend);
	return mix(mix(FrostHash(cell), FrostHash(cell + vec2(1, 0)), blend.x),
	    mix(FrostHash(cell + vec2(0, 1)), FrostHash(cell + vec2(1, 1)), blend.x), blend.y);
}

vec3 FrostCrystal(vec2 point)
{
	vec2 cell = floor(point), local = fract(point), nearest = vec2(0.0), crystalCell = cell;
	float first = 10.0, second = 10.0;
	for (int y = -1; y <= 1; ++y)
		for (int x = -1; x <= 1; ++x)
		{
			vec2 at = vec2(x, y), id = cell + at;
			vec2 offset = local - at - vec2(FrostHash(id), FrostHash(id + 19.7));
			float distance = dot(offset, offset);
			if (distance < first)
			{
				second = first;
				first = distance;
				nearest = offset;
				crystalCell = id;
			}
			else second = min(second, distance);
		}
	float angle = FrostHash(crystalCell + 71.3) * 6.2831853;
	vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * nearest;
	float width = clamp(fwidth(q.x) * .85, .004, .012);
	float taper = 1.0 - smoothstep(.12, .72, abs(q.y));
	float stem = 1.0 - smoothstep(width, width * 3.0, abs(q.x));
	// paired sixty-degree branches, with smaller barbs along each branch. no warped cloud field.
	float branchAxis = q.y - abs(q.x) * .57735027;
	float branch = abs(fract(branchAxis * 7.0 + .5) - .5) / 7.0;
	float barbs = abs(fract((q.y + abs(q.x) * .57735027) * 21.0 + .5) - .5) / 21.0;
	float ribs = (1.0 - smoothstep(width, width * 2.5, branch)) *
	    (1.0 - smoothstep(.05, max(.051, .47 * taper), abs(q.x))) * taper;
	float fine = (1.0 - smoothstep(width * .6, width * 1.5, barbs)) *
	    (1.0 - smoothstep(.012, .055, branch)) * taper;
	float fern = clamp(stem * taper + ribs + fine * .48, 0.0, 1.0);
	float border = 1.0 - smoothstep(.008, .055, second - first);
	float facet = FrostHash(crystalCell + 3.1) * .6 + .2;
	return vec3(facet, max(fern, border * .65), taper);
}

vec4 LensFrost()
{
	float cold = clamp(postFrame.grading.w, 0.0, 1.0);
	if (cold <= .001) return vec4(0.0);
	float rim = max(abs(uv.x * 2.0 - 1.0), abs(uv.y * 2.0 - 1.0));
	float reach = mix(.98, .52, cold);
	if (rim < reach - .22) return vec4(0.0);

	float aspect = max(postFrame.ocular.w, .25);
	float pixels = min(720.0, 1.0 / max(postFrame.texelModeHistory.y, .000001));
	vec2 grid = vec2(pixels * aspect, pixels);
	vec2 point = ((floor(uv * grid) + .5) / grid) * vec2(aspect, 1.0);
	float coarse = FrostField(point * 5.5);
	float coverage = smoothstep(reach - .10, reach + .16, rim + (coarse - .5) * .22) * cold;
	if (coverage <= .001) return vec4(0.0);

	vec3 crystal = FrostCrystal(point * 11.0);
	float grain = FrostHash(floor(point * 210.0));
	coverage *= .30 + .70 * max(crystal.y, crystal.x * .45);
	return vec4(coverage, crystal.x * crystal.y, crystal.y, grain);
}

vec3 FrostedSample(vec2 address)
{
	vec2 inset = postFrame.texelModeHistory.xy * .5;
	return max(textureLod(u_source, S3DFramebufferUv(clamp(address, inset, vec2(1.0) - inset)), 0.0).rgb,
	    vec3(0.0));
}

vec3 FrostedSource(vec3 source, vec4 frost)
{
	if (frost.x <= .001) return source;
	vec2 spread = vec2(1.0 / max(postFrame.ocular.w, .25), 1.0) * (mix(1.5, 8.0, frost.x) / 720.0) *
	    (.8 + frost.y * .4);
	vec2 first = spread * vec2(1.0, .35), second = spread * vec2(-.35, 1.0);
	vec3 scattered = (source + FrostedSample(uv + first) + FrostedSample(uv - first) +
	                     FrostedSample(uv + second) + FrostedSample(uv - second)) *
	    .2;
	return mix(source, scattered, frost.x * (.45 + frost.y * .35));
}

vec3 FrozenVision(vec3 display, vec4 frost)
{
	float cold = clamp(postFrame.grading.w, 0.0, 1.0);
	float shock = clamp(postFrame.cinema.y, 0.0, 1.0);
	if (max(cold, shock) <= .001) return display;
	float luminance = dot(display, vec3(.2126, .7152, .0722));
	vec3 steel = mix(display, vec3(luminance), .75) * vec3(.62, .87, 1.22);
	steel += vec3(.005, .018, .040) * (1.0 - smoothstep(.15, .80, luminance));
	display = mix(display, steel, clamp(cold * .96 + shock * .14, 0.0, 1.0));

	if (frost.x <= .001) return max(display, vec3(0.0));
	float opacity = min(frost.x * (.22 + frost.y * .24 + frost.z * .21 + frost.w * .05), .78);
	vec3 ice = (vec3(.57, .73, .82) + vec3(.18, .20, .20) * frost.z) *
	    mix(.48, 1.0, clamp(luminance, 0.0, 1.0));
	// the film sticks to the lens. thaw its coverage instead of sliding a pattern over the room.
	display = mix(display, ice + max(display - 1.0, vec3(0.0)), opacity);
	return max(display + vec3(.015, .030, .045) * shock * frost.x, vec3(0.0));
}

void main()
{
	vec3 source = max(texture(u_source, S3DFramebufferUv(uv)).rgb, vec3(0.0));
	vec4 frost = LensFrost();
	source = FrostedSource(source, frost);
	vec3 display = postFrame.sourceEncoding.x > 0.5 ? source : sqrt(source);
	if (postFrame.grading.y > 0.0001)
	{
		vec3 graded = GradeLookup(display) + max(display - 1.0, vec3(0.0));
		display = mix(display, graded, postFrame.grading.y);
	}
	vec2 centered = uv * 2.0 - 1.0;
	float shade = 1.0 - smoothstep(0.45, 1.80, dot(centered, centered)) * postFrame.grading.z;
	display *= sqrt(shade);
	display = FrozenVision(display, frost);
	vec3 color = postFrame.sourceEncoding.x > 0.5 ? display : display * display;
	FragColor = vec4(color, 1.0);
}
