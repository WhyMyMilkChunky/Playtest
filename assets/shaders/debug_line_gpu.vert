#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec4 aStart;
layout(location = 1) in vec4 aEnd;
layout(location = 2) in vec4 aColor;
layout(location = 3) in vec4 aViewProjection0;
layout(location = 4) in vec4 aViewProjection1;
layout(location = 5) in vec4 aViewProjection2;
layout(location = 6) in vec4 aViewProjection3;

layout(location = 0) out vec4 color;

void main()
{
	mat4 viewProjection = mat4(aViewProjection0, aViewProjection1,
		aViewProjection2, aViewProjection3);
	color = aColor;
	gl_Position = S3DClipPosition(viewProjection *
		(gl_VertexIndex == 0 ? aStart : aEnd));
}
