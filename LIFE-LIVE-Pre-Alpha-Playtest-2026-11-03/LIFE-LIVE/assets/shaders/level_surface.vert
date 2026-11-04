#version 460 core

#include "include/s3d_backend.glsl"
#include "include/game_surface_ao.glsl"
#include "include/game_world_gpu.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTcoord;
layout(location = 10) in vec3 aColor;
layout(location = 11) in float aMaterial;
layout(location = 12) in float aBakedAoIndex;
layout(location = 13) in vec2 aBakedAoFaceSize;
layout(location = 14) in float aChunkIndex;

S3D_RESOURCE(2, 3) uniform samplerBuffer u_bakedAo;
S3D_RESOURCE(2, 7) uniform samplerBuffer u_fxgiCharts;

layout(location = 0) out vec3 position;
layout(location = 1) out vec3 normal;
layout(location = 2) out vec3 instanceColor;
layout(location = 3) out vec2 boxUv;
layout(location = 4) flat out int materialIndex;
layout(location = 5) out float bakedAmbientOcclusion;
layout(location = 6) flat out vec2 bakedAoFaceSize;
layout(location = 7) flat out int worldChunkIndex;
layout(location = 8) out vec3 texturePosition;
layout(location = 9) flat out vec4 fxgiChart;
layout(location = 10) flat out vec4 fxgiUvBounds;
layout(location = 11) flat out int lightingLodMode;
layout(location = 12) flat out vec4 fxgiRadianceRed;
layout(location = 13) flat out vec4 fxgiRadianceGreen;
layout(location = 14) flat out vec4 fxgiRadianceBlue;
layout(location = 15) flat out vec4 bloodSurface;

invariant gl_Position;

void main()
{
	vec4 worldPosition = vec4(aPosition, 1.0);
	position = aPosition;
	texturePosition = aPosition;
	normal = normalize(aNormal);
	bloodSurface = vec4(normal, dot(position, normal));
	instanceColor = aColor;
	boxUv = aTcoord;
	materialIndex = int(round(aMaterial));
	if ((int(round(fract(aMaterial) * 16.0)) & 1) != 0)
		materialIndex += materialIndex < 0 ? -1024 : 1024;
	int address = int(aBakedAoIndex + 0.5);
	bool unwrappedBox = aBakedAoFaceSize.y < -1.0;
	if (unwrappedBox)
	{
		int modelFace = (address / 4) % 6;
		bool alternateDiagonal = modelFace == 1 || modelFace == 2 || modelFace == 4;
		bakedAmbientOcclusion =
		    QuadCornerBakedAo(u_bakedAo, address, -aBakedAoFaceSize - vec2(2.0), alternateDiagonal);
	}
	else
		bakedAmbientOcclusion = aBakedAoFaceSize.x < 0.0 ? SurfaceBakedAo(u_bakedAo, address, aTcoord)
		                                                 : texelFetch(u_bakedAo, address).r;
	bakedAoFaceSize = unwrappedBox ? vec2(0.0) : abs(aBakedAoFaceSize);
	worldChunkIndex = int(aChunkIndex + 0.5);
	lightingLodMode = S3DWorldLightingMode(worldChunkIndex);
	fxgiChart = vec4(-1.0);
	fxgiUvBounds = vec4(0.0, 0.0, 1.0, 1.0);
	fxgiRadianceRed = vec4(0.0);
	fxgiRadianceGreen = vec4(0.0);
	fxgiRadianceBlue = vec4(0.0);
	int face = address / 4;
	if (worldFrame.fxgiSettings.x > 0.5 && materialIndex >= 0 && face >= 0 &&
	    face < int(worldFrame.fxgiSettings.w))
	{
		int chart = face * 5;
		fxgiChart = texelFetch(u_fxgiCharts, chart);
		fxgiUvBounds = texelFetch(u_fxgiCharts, chart + 1);
		fxgiRadianceRed = texelFetch(u_fxgiCharts, chart + 2);
		fxgiRadianceGreen = texelFetch(u_fxgiCharts, chart + 3);
		fxgiRadianceBlue = texelFetch(u_fxgiCharts, chart + 4);
	}
	gl_Position = S3DClipPosition(worldFrame.viewProjection * worldPosition);
}
