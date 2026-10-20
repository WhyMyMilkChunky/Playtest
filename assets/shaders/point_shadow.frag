#version 460 core

in vec3 worldPosition;

uniform vec3 u_lightPosition;
uniform float u_farPlane;

void main()
{
	float radialDepth = clamp(length(worldPosition - u_lightPosition) / u_farPlane,
		0.0, 1.0);
	// The cubemap is deliberately low resolution. A small derivative-based offset
	// stabilizes nearly edge-on casters without the large peter-panning produced by
	// front-face culling or a single oversized world-space bias.
	float depthSlope = max(abs(dFdx(radialDepth)), abs(dFdy(radialDepth)));
	float casterOffset = clamp(depthSlope * 0.55, 0.00012, 0.0015);
	gl_FragDepth = min(radialDepth + casterOffset, 1.0);
}
