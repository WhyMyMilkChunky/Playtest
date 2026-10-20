#version 460 core

#include "include/s3d_backend.glsl"
#include "include/game_model_gpu.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTcoord;
layout(location = 3) in uvec4 aBoneIndices;
layout(location = 4) in vec4 aBoneWeights;
layout(location = 5) in uint aBodyRegion;

const int BONE_COUNT = 20;
const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;

struct EnemyInstance
{
	mat4 modelView;
	mat4 normalMatrix;
	mat4 bones[BONE_COUNT];
	vec4 woundSpheres[WOUND_COUNT];
	vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
};

S3D_RESOURCE(0, 1) layout(std430) readonly buffer EnemyInstanceBuffer
{
	EnemyInstance enemyInstances[];
};

layout(location = 0) out vec3 localPosition;
layout(location = 1) out vec3 surfaceNormal;
layout(location = 2) out vec2 uv;
layout(location = 3) flat out vec4 materialSettings;
layout(location = 4) out vec3 bodyPosition;
layout(location = 5) flat out vec4 woundSpheres[WOUND_COUNT];
layout(location = 13) flat out vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
layout(location = 15) flat out float bodyRegion;

void main()
{
	EnemyInstance instance = enemyInstances[S3D_INSTANCE_INDEX];
	mat4 skin = instance.bones[aBoneIndices.x] * aBoneWeights.x +
		instance.bones[aBoneIndices.y] * aBoneWeights.y +
		instance.bones[aBoneIndices.z] * aBoneWeights.z +
		instance.bones[aBoneIndices.w] * aBoneWeights.w;
	vec4 skinnedPosition = skin * vec4(aPosition, 1.0);
	vec3 skinnedNormal = normalize(mat3(skin) * aNormal);
	vec4 viewPosition = instance.modelView * skinnedPosition;
	localPosition = viewPosition.xyz;
	surfaceNormal = normalize(mat3(instance.normalMatrix) * skinnedNormal);
	uv = aTcoord;
	materialSettings = modelFrame.materialSettings;
	bodyPosition = aPosition;
	for (int wound = 0; wound < WOUND_COUNT; ++wound)
		woundSpheres[wound] = instance.woundSpheres[wound];
	for (int group = 0; group < WOUND_REGION_VECTOR_COUNT; ++group)
		woundRegions[group] = instance.woundRegions[group];
	bodyRegion = float(aBodyRegion);
	gl_Position = S3DClipPosition(modelFrame.projection * viewPosition);
}
