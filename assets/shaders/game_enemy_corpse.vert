#version 460 core

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec2 aTcoord;
layout (location = 3) in uvec4 aBoneIndices;
layout (location = 4) in vec4 aBoneWeights;
layout (location = 5) in uint aBodyRegion;

const int BONE_COUNT = 20;
const int BODY_REGION_COUNT = 11;
const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;

uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_bones[BONE_COUNT];
uniform mat4 u_regionWorlds[BODY_REGION_COUNT];
uniform vec4 u_woundSpheres[WOUND_COUNT];
uniform vec4 u_woundRegions[WOUND_REGION_VECTOR_COUNT];

out vec3 localPosition;
out vec3 surfaceNormal;
out vec2 uv;
out vec3 bodyPosition;
flat out vec4 woundSpheres[WOUND_COUNT];
flat out vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
flat out float bodyRegion;

float WoundRegion(int index)
{
	vec4 regionSet = u_woundRegions[index / 4];
	int component = index % 4;
	if (component == 0) return regionSet.x;
	if (component == 1) return regionSet.y;
	if (component == 2) return regionSet.z;
	return regionSet.w;
}

vec3 DeformWounds(vec3 position, vec3 normal, uint region)
{
	for (int woundIndex = 0; woundIndex < WOUND_COUNT; ++woundIndex)
	{
		vec4 wound = u_woundSpheres[woundIndex];
		// Wounds are packed from the front. Stop before doing distance work for
		// the unused slots, which is the common case for every corpse vertex.
		if (wound.w <= 0.0) break;
		if (abs(float(region) - WoundRegion(woundIndex)) > 0.25) continue;
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
    if (u_regionWorlds[min(int(aBodyRegion), BODY_REGION_COUNT - 1)][3][3] < 0.5)
    {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

	vec3 deformedPosition = DeformWounds(aPosition, aNormal, aBodyRegion);
	mat4 skin = u_bones[aBoneIndices.x] * aBoneWeights.x +
		u_bones[aBoneIndices.y] * aBoneWeights.y +
		u_bones[aBoneIndices.z] * aBoneWeights.z +
		u_bones[aBoneIndices.w] * aBoneWeights.w;
	vec4 skinnedPosition = skin * vec4(deformedPosition, 1.0);
	vec3 skinnedNormal = normalize(mat3(skin) * aNormal);
	vec4 viewPosition = u_view * skinnedPosition;
	localPosition = viewPosition.xyz;
	surfaceNormal = normalize(mat3(u_view) * skinnedNormal);
	uv = aTcoord;
	bodyPosition = aPosition;
	for (int wound = 0; wound < WOUND_COUNT; ++wound)
		woundSpheres[wound] = u_woundSpheres[wound];
	for (int group = 0; group < WOUND_REGION_VECTOR_COUNT; ++group)
		woundRegions[group] = u_woundRegions[group];
	bodyRegion = float(aBodyRegion);
	gl_Position = u_projection * viewPosition;
}
