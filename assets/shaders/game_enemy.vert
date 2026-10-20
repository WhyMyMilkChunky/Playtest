#version 460 core

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec2 aTcoord;
layout (location = 3) in uvec4 aBoneIndices;
layout (location = 4) in vec4 aBoneWeights;
layout (location = 5) in uint aBodyRegion;

const int BONE_COUNT = 20;
const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;

uniform mat4 u_mvp;
uniform mat4 u_modelView;
uniform mat3 u_normal;
uniform mat4 u_bones[BONE_COUNT];
uniform vec4 u_woundSpheres[WOUND_COUNT];
uniform vec4 u_woundRegions[WOUND_REGION_VECTOR_COUNT];

out vec3 localPosition;
out vec3 surfaceNormal;
out vec2 uv;
out vec3 bodyPosition;
flat out vec4 woundSpheres[WOUND_COUNT];
flat out vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
flat out float bodyRegion;

void main()
{
	mat4 skin = u_bones[aBoneIndices.x] * aBoneWeights.x +
		u_bones[aBoneIndices.y] * aBoneWeights.y +
		u_bones[aBoneIndices.z] * aBoneWeights.z +
		u_bones[aBoneIndices.w] * aBoneWeights.w;
	vec4 skinnedPosition = skin * vec4(aPosition, 1.0);
	vec3 skinnedNormal = normalize(mat3(skin) * aNormal);
	localPosition = (u_modelView * skinnedPosition).xyz;
	surfaceNormal = normalize(u_normal * skinnedNormal);
	uv = aTcoord;
	bodyPosition = aPosition;
	for (int wound = 0; wound < WOUND_COUNT; ++wound)
		woundSpheres[wound] = u_woundSpheres[wound];
	for (int group = 0; group < WOUND_REGION_VECTOR_COUNT; ++group)
		woundRegions[group] = u_woundRegions[group];
	bodyRegion = float(aBodyRegion);
	gl_Position = u_mvp * skinnedPosition;
}
