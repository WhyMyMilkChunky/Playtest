#version 460 core

layout(location = 0) in vec2 uv;
layout(location = 1) in vec4 color;
layout(location = 0) out vec4 fragmentColor;

layout(set = 1, binding = 0) uniform sampler2D sourceTexture;

void main()
{
	fragmentColor = color * texture(sourceTexture, uv);
}
