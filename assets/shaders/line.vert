#version 460 core

layout(location = 0) in vec3 a_start;
layout(location = 1) in vec3 a_end;
layout(location = 2) in vec3 a_color;

uniform mat4 u_mvp;

flat out vec3 lineColor;

void main()
{
	vec4 position = vec4(gl_VertexID == 0 ? a_start : a_end, 1.0);
	lineColor = a_color;
    gl_Position = u_mvp * position;
}
