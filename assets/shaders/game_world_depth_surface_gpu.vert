#version 460 core
#include "include/s3d_backend.glsl"
layout(location = 0) in vec3 aPosition;
S3D_RESOURCE(0, 0) layout(std140) uniform WorldDepthFrame { mat4 viewProjection; }
frame;
invariant gl_Position;
void main()
{
	vec4 worldPosition = vec4(aPosition, 1.0);
	gl_Position = S3DClipPosition(frame.viewProjection * worldPosition);
}
