#version 460 core

#include "include/s3d_backend.glsl"
#include "include/game_surface_ao.glsl"

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec3 aNormal;
layout (location = 2) in vec2 aTcoord;

layout (location = 3) in mat4 aWorld;
layout (location = 7) in mat3 aNormalMatrix;
layout (location = 10) in vec3 aColor;
layout (location = 11) in float aMaterial;
layout (location = 12) in float aBakedAoIndex;
layout (location = 13) in vec2 aBakedAoFaceSize;

uniform mat4 u_viewProjection;
S3D_RESOURCE(2, 3) uniform samplerBuffer u_bakedAo;
uniform int u_surfacePass;
uniform int u_fxgiEnabled;
uniform int u_fxgiFaceCount;
layout(binding = 7) uniform samplerBuffer u_fxgiCharts;

out vec3 position;
out vec3 texturePosition;
out vec3 normal;
out vec3 instanceColor;
out vec2 boxUv;
flat out int materialIndex;
out float bakedAmbientOcclusion;
flat out vec2 bakedAoFaceSize;
flat out vec4 fxgiChart;
flat out vec4 fxgiUvBounds;

// Match the depth prepass even when the two programs optimize unused varyings differently.
invariant gl_Position;

void main()
{
	bool compiledSurface = u_surfacePass != 0;
	vec4 worldPosition = compiledSurface ? vec4(aPosition, 1.0) :
		aWorld * vec4(aPosition, 1.0);
	position = worldPosition.xyz;
	// Moving instances keep world texel density without anchoring their art to the room.
	bool movingSurface = !compiledSurface && fract(aMaterial) > 0.125;
	texturePosition = movingSurface ? mat3(aWorld) * aPosition : worldPosition.xyz;
	normal = normalize(compiledSurface ? aNormal : aNormalMatrix * aNormal);
	instanceColor = aColor;
	boxUv = aTcoord;
	materialIndex = int(round(aMaterial));
	int bakedAddress = compiledSurface ? int(aBakedAoIndex + 0.5) :
		int(aBakedAoIndex + 0.5) * 24 + gl_VertexID;
	bakedAmbientOcclusion = compiledSurface && aBakedAoFaceSize.x < 0.0 ?
		SurfaceBakedAo(u_bakedAo, bakedAddress, aTcoord) : texelFetch(u_bakedAo, bakedAddress).r;
	bakedAoFaceSize = compiledSurface ? abs(aBakedAoFaceSize) : vec2(0.0);
	fxgiChart = vec4(-1.0);
	fxgiUvBounds = vec4(0.0, 0.0, 1.0, 1.0);
	int face = int(aBakedAoIndex + 0.5) / 4;
	if (u_fxgiEnabled != 0 && compiledSurface && materialIndex >= 0 &&
		face >= 0 && face < u_fxgiFaceCount)
	{
		int address = face * 2;
		fxgiChart = texelFetch(u_fxgiCharts, address);
		fxgiUvBounds = texelFetch(u_fxgiCharts, address + 1);
	}
	gl_Position = u_viewProjection * worldPosition;
}
