#version 460 core

layout (location = 0) in vec3 aPosition;
layout (location = 2) in vec2 aTcoord;

uniform mat4 u_mvp;

out vec2 uv;

void main()
{
	uv = aTcoord;
	gl_Position = u_mvp * vec4(aPosition, 1.0);
}
