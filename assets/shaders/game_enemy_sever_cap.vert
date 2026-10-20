#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in uvec4 aBoneIndices;
layout(location = 3) in vec4 aBoneWeights;
layout(location = 4) in uint aMotionRegion;
layout(location = 5) in uint aCutRegion;

const int BONE_COUNT = 20;
const int BODY_REGION_COUNT = 11;

S3D_RESOURCE(0, 0) layout(std140) uniform SeverCapFrameBlock
{
	mat4 projection;
	vec4 color;
} capFrame;

struct SeverCapInstance
{
	mat4 view;
	mat4 bones[BONE_COUNT];
	mat4 regionWorlds[BODY_REGION_COUNT];
	vec4 severedRegions[3];
};

S3D_RESOURCE(0, 1) layout(std430) readonly buffer SeverCapInstanceBuffer
{
	SeverCapInstance capInstances[];
};

layout(location = 0) out vec3 viewPosition;
layout(location = 1) out vec3 viewNormal;
layout(location = 2) flat out vec4 capColor;

float RegionFlag(SeverCapInstance instance, uint region)
{
	vec4 flags = instance.severedRegions[region / 4u];
	uint component = region % 4u;
	if (component == 0u) return flags.x;
	if (component == 1u) return flags.y;
	if (component == 2u) return flags.z;
	return flags.w;
}



void main()
{
	SeverCapInstance instance = capInstances[S3D_INSTANCE_INDEX];
	capColor = capFrame.color;
	if (RegionFlag(instance, aCutRegion) < 0.5 ||
        instance.regionWorlds[min(int(aMotionRegion), BODY_REGION_COUNT - 1)][3][3] < 0.5)
	{
		viewPosition = vec3(0.0);
		viewNormal = vec3(0.0, 1.0, 0.0);
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}

	mat4 skin = instance.bones[aBoneIndices.x] * aBoneWeights.x +
		instance.bones[aBoneIndices.y] * aBoneWeights.y +
		instance.bones[aBoneIndices.z] * aBoneWeights.z +
		instance.bones[aBoneIndices.w] * aBoneWeights.w;
	mat4 modelView = instance.view;
	vec4 position = modelView * skin * vec4(aPosition, 1.0);
	viewPosition = position.xyz;
	viewNormal = normalize(mat3(modelView * skin) * aNormal);
	gl_Position = S3DClipPosition(capFrame.projection * position);
}
