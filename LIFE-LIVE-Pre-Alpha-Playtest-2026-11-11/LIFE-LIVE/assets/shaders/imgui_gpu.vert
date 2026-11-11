#version 460 core
#extension GL_GOOGLE_include_directive : enable

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aColor;

layout(set = 0, binding = 0) uniform GuiTransform { vec4 scaleTranslate; vec4 implant; vec4 raster; vec4 sonarRows[3]; vec4 sonarStops[16]; };

layout(location = 0) out vec2 uv;
layout(location = 1) out vec4 color;
layout(location = 2) out vec2 uiPosition;
#define S3D_GUI_VERTEX
#include "include/gui_implant.glsl"

void main()
{
	uv = aUv;
	color = aColor;
	uiPosition = aPosition;
	vec2 position = ImplantPosition(aPosition, implant);
	gl_Position = vec4(position * scaleTranslate.xy + scaleTranslate.zw, 0.0, 1.0);
}
