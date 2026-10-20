#version 460 core

layout(location = 0) in vec3 aPosition;
layout(location = 3) in mat4 aWorld;
uniform mat4 u_viewProjection;
uniform int u_surfacePass;

// Both world passes promise the same clip position for the same input geometry.
invariant gl_Position;

void main()
{
	bool compiledSurface = u_surfacePass != 0;
	vec4 worldPosition = compiledSurface ? vec4(aPosition, 1.0) :
		aWorld * vec4(aPosition, 1.0);
	gl_Position = u_viewProjection * worldPosition;
}
