#version 460 core

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aColor;

layout(set = 0, binding = 0) uniform GuiTransform
{
	vec4 scaleTranslate;
};

layout(location = 0) out vec2 uv;
layout(location = 1) out vec4 color;

void main()
{
	uv = aUv;
	color = aColor;
	gl_Position = vec4(aPosition * scaleTranslate.xy + scaleTranslate.zw,
		0.0, 1.0);
}
