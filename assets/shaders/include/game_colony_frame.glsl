#ifndef S3D_COLONY_FRAME_GLSL
#define S3D_COLONY_FRAME_GLSL
#include "s3d_backend.glsl"

const int COLONY_SECTION_COUNT = 15;
const int COLONY_WOUND_COUNT = 12;
S3D_RESOURCE(0, 0) layout(std140) uniform ColonyFrame
{
	mat4 viewProjection;
	mat4 bodyWorld;
	vec4 eyeTime;
	vec4 forwardFlash;
	vec4 motion;
	vec4 counts; // loose bugs, dying, visible emergency lights, attached bugs.
	vec4 sectionFirst[15];
	vec4 sectionLast[15];
	vec4 holeFirst[36];
	vec4 holeLast[36];
	vec4 fallenFirst[15];
	vec4 fallenLast[15];
	vec4 fallenOrigin[15];
	vec4 pointPositions[8];
	vec4 pointColors[8];
};

struct ColonyPose
{
	mat4 world;
	// kind, variation, signed curl (100 hides it), exposed-edge shading.
	vec4 parameters;
	vec4 gait; // stride clock, activity, loose-tail weight, turn bend.
};

// matches ColonyBugPose; the swarm writes these on the gpu, the camera bugs use cpu poses.
struct ColonySpine
{
	vec4 points[11];
	vec4 normals[11];
	vec4 parameters;
};

float ColonyHoleDistance(vec3 p, int index)
{
	float nearest = 1e10;
	for (int part = 0; part < 3; ++part)
	{
		int cut = index * 3 + part;
		vec3 axis = holeLast[cut].xyz - holeFirst[cut].xyz;
		float t = clamp(dot(p - holeFirst[cut].xyz, axis) / max(dot(axis, axis), .000001), 0.0, 1.0);
		nearest = min(nearest, length(p - holeFirst[cut].xyz - axis * t) - holeFirst[cut].w);
	}
	return nearest;
}
#endif
