#version 330 core
#ifndef S3D_OPENGL
#extension GL_GOOGLE_include_directive : enable
#endif

in vec2 Position;
in vec2 UV;
in vec4 Color;
uniform mat4 ProjMtx;
uniform vec4 uImplant;
out vec2 uv;
out vec4 color;
out vec2 uiPosition;
#define S3D_GUI_VERTEX
#include "include/gui_implant.glsl"

void main()
{
	uv = UV;
	color = Color;
	uiPosition = Position;
	gl_Position = ProjMtx * vec4(ImplantPosition(Position, uImplant), 0, 1);
}
