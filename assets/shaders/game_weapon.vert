#version 460 core

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec2 aTcoord;

const int WOUND_COUNT = 8;
const int WOUND_REGION_VECTOR_COUNT = 2;

uniform mat4 u_mvp;
uniform mat4 u_modelView;
uniform mat3 u_normal;

out vec3 localPosition;
out vec3 surfaceNormal;
out vec2 uv;
out vec3 bodyPosition;
flat out vec4 woundSpheres[WOUND_COUNT];
flat out vec4 woundRegions[WOUND_REGION_VECTOR_COUNT];
flat out float bodyRegion;

void main()
{
    localPosition = (u_modelView * vec4(aPosition, 1.0)).xyz;
    surfaceNormal = normalize(u_normal * aNormal);
    uv = aTcoord;
	bodyPosition = aPosition;
	for (int wound = 0; wound < WOUND_COUNT; ++wound)
		woundSpheres[wound] = vec4(0.0);
	for (int group = 0; group < WOUND_REGION_VECTOR_COUNT; ++group)
		woundRegions[group] = vec4(-1.0);
	bodyRegion = -1.0;
    gl_Position = u_mvp * vec4(aPosition, 1.0);
}
