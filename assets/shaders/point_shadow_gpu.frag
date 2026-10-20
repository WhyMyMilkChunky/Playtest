#version 460 core

#include "include/s3d_backend.glsl"

S3D_RESOURCE(0, 0) uniform ShadowFrame
{
	mat4 viewProjection;
	vec4 lightPositionFar;
} shadowFrame;

layout(location = 0) in vec3 worldPosition;

void main()
{
	float radialDepth = clamp(length(worldPosition - shadowFrame.lightPositionFar.xyz) /
		shadowFrame.lightPositionFar.w, 0.0, 1.0);
	float depthSlope = max(abs(dFdx(radialDepth)), abs(dFdy(radialDepth)));
	float casterOffset = clamp(depthSlope * 0.55, 0.00012, 0.0015);
	gl_FragDepth = min(radialDepth + casterOffset, 1.0);
}
