#ifndef S3D_COLONY_SPINE_GLSL
#define S3D_COLONY_SPINE_GLSL

S3D_RESOURCE(0, 5) layout(std430) writeonly buffer ColonySpineOutput { ColonySpine outputSpines[]; };

vec3 ColonyCapsuleAxisPoint(vec3 point, ColonyPath path)
{
	return path.center + path.axis * clamp(dot(point - path.center, path.axis),
		-path.halfLength, path.halfLength);
}

float ColonySpineCoverage(ColonyPath path, float time, vec3 point, float nearest, float bodyLength)
{
	vec3 normal;
	vec3 anchor = FollowColonyPath(path, time, normal);
	uint support = Support(anchor) & 3u;
	if (support != 1u && support != 3u) return 0.0;
	if (nearest > bodyLength * 1.4) return 1.0;

	float distance = 1e10;
	for (int wound = 0; wound < COLONY_WOUND_COUNT; ++wound)
		if (holeFirst[wound * 3].w > .001)
			distance = min(distance, ColonyHoleDistance(point, wound));
	return clamp(distance * 100.0 + .5, 0.0, 1.0);
}

void BuildColonySpine(uint index, ColonyPose pose, vec4 seed, float time, float surfaceSpeed,
	float clinging, float nearest, float floorHeight)
{
	int section = int(seed.x);
	float size = max(length(pose.world[0].xyz), .001), bodyLength = size * 1.65;
	float stepLength = bodyLength * .1;
	float trail = clamp(bodyLength / max(surfaceSpeed, .045), .12, 2.0);
	ColonyPath path = BuildColonyPath(seed, sectionFirst[section].xyz,
		sectionLast[section].xyz, sectionFirst[section].w);
	vec4 anchorSeed = seed;
	anchorSeed.w = -.55;
	ColonyPath supportPath = BuildColonyPath(anchorSeed, seeds[section * 2].xyz,
		seeds[section * 2 + 1].xyz, seeds[section * 2].w);
	vec3 origin = pose.world[3].xyz;
	vec3 up = SafeDirection(pose.world[1].xyz, vec3(0, 1, 0));
	vec3 forward = SafeDirection(pose.world[2].xyz, vec3(0, 0, 1));
	vec3 right = SafeDirection(pose.world[0].xyz, vec3(1, 0, 0));
	vec3 baseNormal;
	vec3 base = FollowColonyPath(path, time, baseNormal);
	float phase = eyeTime.w * (3.8 + fract(seed.z * 17.0)) + pose.parameters.y;
	float hanging = smoothstep(.76, .98, Hash(float(index) + 177.0)) *
		(1.0 - smoothstep(.20, .85, up.y)) * smoothstep(.65, 1.05, seed.w) * clinging;
	vec3 following = origin;

	// one chain per insect, not a physics body per segment. tails follow the head without stretching.
	for (int joint = 10; joint >= 0; --joint)
	{
		float u = float(joint) * .1, clock = time + (u - 1.0) * trail;
		vec3 normal;
		vec3 onSurface = FollowColonyPath(path, clock, normal);
		vec3 freeCurve = origin + forward * ((u - 1.0) * bodyLength) +
			right * ((sin(phase - u * 7.5) - sin(phase - 7.5)) * bodyLength * .14) +
			up * ((cos(phase * .73 - u * 5.3) - cos(phase * .73 - 5.3)) * bodyLength * .09);
		vec3 point = mix(freeCurve, origin + onSurface - base, clinging);
		point += right * ((sin(phase - u * 8.0) - sin(phase - 8.0)) * bodyLength * .05 * clinging);
		normal = SafeDirection(mix(up, normal, clinging), up);

		float tail = 1.0 - smoothstep(0.0, .85, u);
		point.y -= tail * tail * hanging * bodyLength * .85;
		point += right * (sin(phase * .65 - u * 4.0) * tail * hanging * bodyLength * .10);
		if (joint < 10)
		{
			vec3 offset = point - following;
			float span = length(offset);
			point = following + SafeDirection(offset, -forward) *
				clamp(span, stepLength * .65, stepLength * 1.04);
		}
		if (clinging > .99 && counts.y < .5)
		{
			vec3 axisPoint = ColonyCapsuleAxisPoint(point, path);
			vec3 radial = point - axisPoint;
			float minimumRadius = length(onSurface - ColonyCapsuleAxisPoint(onSurface, path)) * .90;
			if (dot(radial, radial) < minimumRadius * minimumRadius)
				point = axisPoint + SafeDirection(radial, normal) * minimumRadius;
		}
		point.y = max(point.y, floorHeight);
		float coverage = clinging > .99 && counts.y < .5
			? ColonySpineCoverage(supportPath, clock, point, nearest, bodyLength) : 1.0;
		outputSpines[index].points[joint] = vec4(point, size);
		outputSpines[index].normals[joint] = vec4(normal, coverage);
		following = point;
	}
	outputSpines[index].parameters = vec4(0);
}

#endif
