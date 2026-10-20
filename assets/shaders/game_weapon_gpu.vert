#version 460 core

#include "include/s3d_backend.glsl"
#include "include/game_model_gpu.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTcoord;

const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;
layout(location = 3) in vec4 aModelView0;
layout(location = 4) in vec4 aModelView1;
layout(location = 5) in vec4 aModelView2;
layout(location = 6) in vec4 aModelView3;
layout(location = 7) in vec4 aNormalMatrix0;
layout(location = 8) in vec4 aNormalMatrix1;
layout(location = 9) in vec4 aNormalMatrix2;
layout(location = 11) in vec4 aMaterialSettings;

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
	mat4 modelView = mat4(aModelView0, aModelView1, aModelView2, aModelView3);
	mat3 normalMatrix = mat3(aNormalMatrix0.xyz, aNormalMatrix1.xyz,
		aNormalMatrix2.xyz);
	vec4 viewPosition = modelView * vec4(aPosition, 1.0);
	localPosition = viewPosition.xyz;
	surfaceNormal = normalize(normalMatrix * aNormal);
	uv = aTcoord;
	materialSettings = aMaterialSettings;
	bodyPosition = aPosition;
	for (int wound = 0; wound < WOUND_COUNT; ++wound)
		woundSpheres[wound] = vec4(0.0);
	for (int group = 0; group < WOUND_REGION_VECTOR_COUNT; ++group)
		woundRegions[group] = vec4(-1.0);
	bodyRegion = -1.0;
	gl_Position = S3DClipPosition(modelFrame.projection * viewPosition);
}
