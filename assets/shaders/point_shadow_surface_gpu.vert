#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec3 aPosition;

S3D_RESOURCE(0, 0) uniform ShadowFrame
{
	mat4 viewProjection;
	vec4 lightPositionFar;
} shadowFrame;

layout(location = 0) out vec3 worldPosition;

void main()
{
	worldPosition = aPosition;
	gl_Position = S3DClipPosition(shadowFrame.viewProjection *
		vec4(aPosition, 1.0));
}
