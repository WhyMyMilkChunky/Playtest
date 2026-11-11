#version 460 core
#include "include/s3d_backend.glsl"
#include "include/game_colony_crawl.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aRig;
S3D_RESOURCE(0, 0) layout(std140) uniform BugFrame
{
	mat4 modelView;
	mat4 projection;
	vec4 settings;
};
struct BugPose { vec4 points[11]; vec4 normals[11]; vec4 parameters; };
S3D_RESOURCE(0, 1) layout(std430) readonly buffer BugPoses { BugPose bugs[]; };
layout(location = 0) out vec3 normalView;
layout(location = 1) out vec3 positionView;
layout(location = 2) out vec3 insectPosition;
layout(location = 3) flat out vec2 variationOpacity;
layout(location = 4) out vec3 tangentView;

vec3 SafeDirection(vec3 v, vec3 fallback) { return dot(v, v) > .0000001 ? normalize(v) : fallback; }

void main()
{
	BugPose bug = bugs[S3D_INSTANCE_INDEX];
	vec3 posed, localNormal;
	CentipedeCrawl(aPosition, aNormal, aRig, bug.parameters.y, bug.parameters.w,
		bug.parameters.x, posed, localNormal);
	float leg = aRig.x >= 0.0 && aRig.x <= 2.0 ? aRig.x * .5 : 0.0;
	float coordinate = (posed.z + .5) * 10.0;
	int first = clamp(int(floor(coordinate)), 0, 9);
	float t = coordinate - float(first);
	vec3 center = mix(bug.points[first].xyz, bug.points[first + 1].xyz, t);
	// keep the surface contact points, but carry a smooth frame through each bend.
	vec3 before = bug.points[max(first - 1, 0)].xyz;
	vec3 after = bug.points[min(first + 2, 10)].xyz;
	vec3 segment = SafeDirection(bug.points[first + 1].xyz - bug.points[first].xyz, vec3(0, 0, -1));
	vec3 incoming = SafeDirection(bug.points[first + 1].xyz - before, segment);
	vec3 outgoing = SafeDirection(after - bug.points[first].xyz, segment);
	vec3 forward = SafeDirection(mix(incoming, outgoing, clamp(t, 0.0, 1.0)), segment);
	vec3 up = SafeDirection(mix(bug.normals[first].xyz, bug.normals[first + 1].xyz, clamp(t, 0.0, 1.0)), vec3(0, 1, 0));
	if (abs(dot(up, forward)) > .97) up = abs(forward.y) < .9 ? vec3(0, 1, 0) : vec3(0, 0, 1);
	vec3 right = normalize(cross(up, forward));
	up = normalize(cross(forward, right));
	float size = bug.points[first].w;
	float fold = mix(bug.normals[first].w, bug.normals[first + 1].w, clamp(t, 0.0, 1.0));
	vec3 point = center + right * posed.x * size + up * (posed.y - leg * fold) * size;
	vec4 view = modelView * vec4(point, 1);
	normalView = normalize(mat3(modelView) * (right * localNormal.x + up * localNormal.y + forward * localNormal.z));
	tangentView = normalize(mat3(modelView) * forward);
	positionView = view.xyz;
	insectPosition = aPosition;
	variationOpacity = vec2(bug.parameters.x, bug.parameters.z * settings.y);
	gl_Position = S3DClipPosition(projection * view);
}
