#ifndef S3D_COLONY_CRAWL_GLSL
#define S3D_COLONY_CRAWL_GLSL

void CentipedeCrawl(vec3 rest, vec3 restNormal, vec2 rig, float cycle, float activity,
	float seed, out vec3 point, out vec3 normal)
{
	point = rest;
	normal = restNormal;
	bool leg = rig.x >= 0.0 && rig.x <= 2.0;
	float u = clamp((leg ? rig.y : rest.z) + .5, 0.0, 1.0);
	float wave = (u * 1.1 - cycle * .30) * 6.2831853 + seed;
	point.x += sin(wave) * .012 * activity;

	if (leg)
	{
		// every vertex of a leg shares its segment's clock. the foot plants while the body passes it.
		float side = rest.x < 0.0 ? -1.0 : 1.0;
		float phase = fract(cycle - (.5 - rig.y) * 1.35 + (side > 0.0 ? .5 : 0.0));
		float swing = clamp((phase - .65) / .35, 0.0, 1.0);
		float recovery = swing * swing * (3.0 - 2.0 * swing);
		float stroke = phase < .65 ? mix(.10, -.10, phase / .65) : mix(-.10, .10, recovery);
		float lift = 16.0 * swing * swing * (1.0 - swing) * (1.0 - swing);
		float joint = rig.x * .5;
		point.z += stroke * joint * activity;
		point.y += lift * .10 * joint * activity;
		point.x += side * lift * .025 * (1.0 - joint) * activity;
		normal = restNormal + vec3(-side * lift * .25, 0, -stroke * .4) * activity;
	}
	else if (rig.x >= 3.0)
	{
		float tip = clamp(rig.x - 3.0, 0.0, 1.0);
		float feeler = sin(cycle * 1.7 + seed + sign(rest.x) * 1.8) +
			.28 * sin(cycle * 3.1 + seed * .7 - sign(rest.x));
		point.x += feeler * .045 * tip;
		point.y += (feeler * .5 + .5) * .035 * tip;
	}
	normal.z -= normal.x * cos(wave) * (.012 * 1.1 * 6.2831853) * activity;
	normal = normalize(normal);
}

#endif
