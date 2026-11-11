#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 3) in vec4 aMvp0;
layout(location = 4) in vec4 aMvp1;
layout(location = 5) in vec4 aMvp2;
layout(location = 6) in vec4 aMvp3;
layout(location = 7) in vec4 aColor;

layout(location = 0) out vec4 color;

void main()
{
	mat4 mvp = mat4(aMvp0, aMvp1, aMvp2, aMvp3);
	color = aColor;
	gl_Position = S3DClipPosition(mvp * vec4(aPosition, 1.0));
}
