#version 460 core
#include "include/game_colony_frame.glsl"
#include "include/game_colony_crawl.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aRig;
S3D_RESOURCE(0, 1) layout(std430) readonly buffer ColonyInstances { ColonyPose instances[]; };
S3D_RESOURCE(0, 5) layout(std430) readonly buffer ColonySpines { ColonySpine spines[]; };

layout(location = 0) out vec3 insectPosition;
layout(location = 1) out vec3 worldPosition;
layout(location = 2) out vec3 worldNormal;
layout(location = 3) flat out vec4 insectInfo;
layout(location = 4) out vec3 bodyPosition;
layout(location = 5) out float insectCoverage;

void main()
{
	uint instanceIndex = uint(S3D_INSTANCE_INDEX);
	ColonyPose pose = instances[instanceIndex];
	insectInfo = pose.parameters;
	insectPosition = aPosition;
	bodyPosition = vec3(0);
	worldPosition = vec3(0);
	worldNormal = vec3(0, 1, 0);
	insectCoverage = 1.0;
	if (pose.parameters.z > 50.0)
	{
		gl_Position = vec4(2, 2, 2, 1);
		return;
	}
	vec3 p, posedNormal;
	CentipedeCrawl(aPosition, aNormal, aRig, pose.gait.x, pose.gait.y, pose.parameters.y, p, posedNormal);
	if (instanceIndex < uint(counts.w))
	{
		float coordinate = (p.z + .5) * 10.0;
		int first = clamp(int(floor(coordinate)), 0, 9);
		float blend = coordinate - float(first), normalBlend = clamp(blend, 0.0, 1.0);
		vec4 a = spines[instanceIndex].points[first];
		vec4 b = spines[instanceIndex].points[first + 1];
		vec4 firstNormal = spines[instanceIndex].normals[first];
		vec4 lastNormal = spines[instanceIndex].normals[first + 1];
		vec3 center = mix(a.xyz, b.xyz, blend);
		vec3 forward = b.xyz - a.xyz;
		forward = dot(forward, forward) > .0000001 ? normalize(forward) : normalize(pose.world[2].xyz);
		vec3 up = mix(firstNormal.xyz, lastNormal.xyz, normalBlend);
		up = dot(up, up) > .0000001 ? normalize(up) : normalize(pose.world[1].xyz);
		if (abs(dot(up, forward)) > .97) up = abs(forward.y) < .9 ? vec3(0, 1, 0) : vec3(0, 0, 1);
		vec3 right = normalize(cross(up, forward));
		up = normalize(cross(forward, right));
		vec4 placed = vec4(center + (right * p.x + up * p.y) * a.w, 1);
		vec3 normal = normalize(right * posedNormal.x + up * posedNormal.y + forward * posedNormal.z);
		insectCoverage = mix(firstNormal.w, lastNormal.w, normalBlend);
		if (pose.parameters.x < .5)
		{
			bodyPosition = placed.xyz;
			placed = bodyWorld * placed;
			normal = mat3(bodyWorld) * normal;
		}
		worldPosition = placed.xyz;
		worldNormal = normal;
		gl_Position = S3DClipPosition(viewProjection * placed);
		return;
	}
	p.z *= 1.65;
	float curl = pose.parameters.z, along = p.z - .825, angle = curl * along;
	float bendSin = sin(angle), bendCos = cos(angle);
	float inverseCurl = (curl < 0.0 ? -1.0 : 1.0) / max(abs(curl), .02);
	vec2 arc = abs(curl) > .02 ? vec2(1.0 - bendCos, bendSin) * inverseCurl : vec2(0, along);
	p.xz = vec2(p.x * bendCos + arc.x, .825 - p.x * bendSin + arc.y);
	vec3 bentNormal = vec3(posedNormal.x * bendCos + posedNormal.z * bendSin, posedNormal.y,
		-posedNormal.x * bendSin + posedNormal.z * bendCos);

	vec3 down = pose.parameters.x < .5 ? transpose(mat3(bodyWorld)) * vec3(0, -1, 0) : vec3(0, -1, 0);
	vec3 localDown = transpose(mat3(pose.world)) * down;
	localDown *= inversesqrt(max(dot(pose.world[1].xyz, pose.world[1].xyz), .0000001));
	vec3 gravity = vec3(localDown.x, max(0.0, localDown.y), localDown.z);
	float unsupported = 1.0 - smoothstep(.25, .8, -localDown.y);
	float tail = clamp((.825 - p.z) / 1.65, 0.0, 1.0);
	float droop = pose.gait.z * unsupported;
	p += gravity * tail * tail * droop;
	float slope = -2.0 * tail * droop / 1.65;
	bentNormal.z -= dot(gravity, bentNormal) * slope / max(.25, 1.0 + gravity.z * slope);
	vec4 placed = pose.world * vec4(p, 1);
	vec3 n = normalize(mat3(pose.world) * bentNormal);
	if (pose.parameters.x < .5)
	{
		bodyPosition = placed.xyz;
		placed = bodyWorld * placed;
		n = mat3(bodyWorld) * n;
	}
	worldPosition = placed.xyz;
	worldNormal = n;
	gl_Position = S3DClipPosition(viewProjection * placed);
}
