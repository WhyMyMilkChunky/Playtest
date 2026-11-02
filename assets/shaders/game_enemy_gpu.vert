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
	mat3x4 bones[BONE_COUNT];
	vec4 woundSpheres[WOUND_COUNT];
	vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
	vec4 indirectRed;
	vec4 indirectGreen;
	vec4 indirectBlue;
};

S3D_RESOURCE(0, 1) layout(std430) readonly buffer EnemyInstanceBuffer { EnemyInstance enemyInstances[]; };

layout(location = 0) out vec3 localPosition;
layout(location = 1) out vec3 surfaceNormal;
layout(location = 2) out vec2 uv;
layout(location = 3) flat out vec4 materialSettings;
layout(location = 4) out vec3 bodyPosition;
layout(location = 5) flat out vec4 woundSpheres[WOUND_COUNT];
layout(location = 13) flat out vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
layout(location = 15) flat out float bodyRegion;
layout(location = 16) flat out vec4 indirectRed;
layout(location = 17) flat out vec4 indirectGreen;
layout(location = 18) flat out vec4 indirectBlue;

void main()
{
	int instanceIndex = int(S3D_INSTANCE_INDEX);
	mat3x4 skin = enemyInstances[instanceIndex].bones[aBoneIndices.x] * aBoneWeights.x +
	    enemyInstances[instanceIndex].bones[aBoneIndices.y] * aBoneWeights.y +
	    enemyInstances[instanceIndex].bones[aBoneIndices.z] * aBoneWeights.z +
	    enemyInstances[instanceIndex].bones[aBoneIndices.w] * aBoneWeights.w;
	// cpu rows occupy three vec4 columns here. multiply from the left to keep their orientation.
	// preserve the original homogeneous weight even if imported weights don't sum to exactly one.
	float weight = aBoneWeights.x + aBoneWeights.y + aBoneWeights.z + aBoneWeights.w;
	vec4 skinnedPosition = vec4(vec4(aPosition, 1.0) * skin, weight);
	vec3 skinnedNormal = normalize(aNormal * mat3(skin));
	vec4 viewPosition = enemyInstances[instanceIndex].modelView * skinnedPosition;
	localPosition = viewPosition.xyz;
	// the model/view transform is rigid, so its rotation is already the normal transform.
	surfaceNormal = normalize(mat3(enemyInstances[instanceIndex].modelView) * skinnedNormal);
	uv = aTcoord;
	materialSettings = modelFrame.materialSettings;
	bodyPosition = aPosition;
	for (int wound = 0; wound < WOUND_COUNT; ++wound)
		woundSpheres[wound] = enemyInstances[instanceIndex].woundSpheres[wound];
	for (int group = 0; group < WOUND_REGION_VECTOR_COUNT; ++group)
		woundRegions[group] = enemyInstances[instanceIndex].woundRegions[group];
	bodyRegion = float(aBodyRegion);
	indirectRed = enemyInstances[instanceIndex].indirectRed;
	indirectGreen = enemyInstances[instanceIndex].indirectGreen;
	indirectBlue = enemyInstances[instanceIndex].indirectBlue;
	gl_Position = S3DClipPosition(modelFrame.projection * viewPosition);
}
