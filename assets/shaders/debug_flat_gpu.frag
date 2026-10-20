#version 460 core

layout(location = 0) in vec4 color;
layout(location = 0) out vec4 fragmentColor;

void main()
{
	fragmentColor = color;
}
