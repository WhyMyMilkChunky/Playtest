#version 330 core
#ifndef S3D_OPENGL
#extension GL_GOOGLE_include_directive : enable
#endif

in vec2 uv;
in vec4 color;
in vec2 uiPosition;
uniform sampler2D Texture;
uniform vec4 uImplant;
uniform vec4 uRaster;
uniform vec4 uSonarRows[3];
uniform vec4 uSonarStops[16];
#define S3D_GUI_RASTER uRaster
#define S3D_GUI_SONAR_ROWS uSonarRows
#define S3D_GUI_SONAR_STOPS uSonarStops
out vec4 OutColor;
#include "include/gui_implant.glsl"

void main() { OutColor = ImplantDisplay(Texture, uv, color, uiPosition, uImplant); }
