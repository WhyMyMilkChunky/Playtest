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
const int BODY_REGION_COUNT = 11;
const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;

struct CorpseInstance
{
	mat4 view;
	mat4 bones[BONE_COUNT];
	mat4 regionWorlds[BODY_REGION_COUNT];
	vec4 woundSpheres[WOUND_COUNT];
	vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
};

S3D_RESOURCE(0, 1) layout(std430) readonly buffer CorpseInstanceBuffer
{
	CorpseInstance corpseInstances[];
};

layout(location = 0) out vec3 localPosition;
layout(location = 1) out vec3 surfaceNormal;
layout(location = 2) out vec2 uv;
layout(location = 3) flat out vec4 materialSettings;
layout(location = 4) out vec3 bodyPosition;
layout(location = 5) flat out vec4 woundSpheres[WOUND_COUNT];
layout(location = 13) flat out vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
layout(location = 15) flat out float bodyRegion;

float WoundRegion(CorpseInstance instance, int index)
{
	vec4 regionSet = instance.woundRegions[index / 4];
	int component = index % 4;
	if (component == 0) return regionSet.x;
	if (component == 1) return regionSet.y;
	if (component == 2) return regionSet.z;
	return regionSet.w;
}

vec3 DeformWounds(CorpseInstance instance, vec3 position, vec3 normal,
	uint region)
{
	for (int woundIndex = 0; woundIndex < WOUND_COUNT; ++woundIndex)
	{
		vec4 wound = instance.woundSpheres[woundIndex];
		// Wounds are packed from the front. Stop before doing distance work for
		// the unused slots, which is the common case for every corpse vertex.
		if (wound.w <= 0.0) break;
		if (abs(float(region) - WoundRegion(instance, woundIndex)) > 0.25)
			continue;
		vec3 woundOffset = position - wound.xyz;
		float distanceToHitSquared = dot(woundOffset, woundOffset);
		if (distanceToHitSquared >= wound.w * wound.w) continue;
		float distanceToHit = sqrt(distanceToHitSquared) / wound.w;
		float depression = (1.0 - smoothstep(0.16, 1.0, distanceToHit)) *
			wound.w * 0.32;
		position -= normal * depression;
	}
	return position;
}



void main()
{
	CorpseInstance instance = corpseInstances[S3D_INSTANCE_INDEX];
    if (instance.regionWorlds[min(int(aBodyRegion), BODY_REGION_COUNT - 1)][3][3] < 0.5)
    {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

	vec3 deformedPosition = DeformWounds(instance, aPosition, aNormal,
		aBodyRegion);
	mat4 skin = instance.bones[aBoneIndices.x] * aBoneWeights.x +
		instance.bones[aBoneIndices.y] * aBoneWeights.y +
		instance.bones[aBoneIndices.z] * aBoneWeights.z +
		instance.bones[aBoneIndices.w] * aBoneWeights.w;
	vec4 skinnedPosition = skin * vec4(deformedPosition, 1.0);
	vec3 skinnedNormal = normalize(mat3(skin) * aNormal);
	mat4 modelView = instance.view;
	vec4 viewPosition = modelView * skinnedPosition;
	localPosition = viewPosition.xyz;
	// Corpse transforms are rigid rotations and translations. Their normal
	// matrix is therefore the rotation itself; a per-vertex inverse is wasted.
	surfaceNormal = normalize(mat3(modelView) * skinnedNormal);
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
