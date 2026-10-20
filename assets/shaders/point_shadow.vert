#version 460 core

layout (location = 0) in vec3 aPosition;
layout (location = 3) in mat4 aWorld;

uniform mat4 u_viewProjection;
uniform int u_surfacePass;

out vec3 worldPosition;

void main()
{
	vec4 world = u_surfacePass != 0 ? vec4(aPosition, 1.0) :
		aWorld * vec4(aPosition, 1.0);
	worldPosition = world.xyz;
	gl_Position = u_viewProjection * world;
}
