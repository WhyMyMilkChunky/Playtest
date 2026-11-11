#version 460 core
#extension GL_GOOGLE_include_directive : enable

layout(location = 0) in vec2 uv;
layout(location = 1) in vec4 color;
layout(location = 2) in vec2 uiPosition;
layout(location = 0) out vec4 fragmentColor;

layout(set = 1, binding = 0) uniform sampler2D sourceTexture;
layout(set = 0, binding = 0) uniform GuiTransform { vec4 scaleTranslate; vec4 implant; vec4 raster; vec4 sonarRows[3]; vec4 sonarStops[16]; };
#define S3D_GUI_RASTER raster
#define S3D_GUI_SONAR_ROWS sonarRows
#define S3D_GUI_SONAR_STOPS sonarStops
#include "include/gui_implant.glsl"

void main() { fragmentColor = ImplantDisplay(sourceTexture, uv, color, uiPosition, implant); }
