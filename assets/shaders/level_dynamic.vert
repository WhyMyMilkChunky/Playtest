#version 460 core

#include "include/s3d_backend.glsl"
#include "include/game_world_gpu.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTcoord;
layout(location = 3) in mat4 aWorld;
layout(location = 7) in mat3 aNormalMatrix;
layout(location = 10) in vec3 aColor;
layout(location = 11) in float aMaterial;
layout(location = 12) in float aBakedAoIndex;
layout(location = 14) in float aChunkIndex;

S3D_RESOURCE(2, 3) uniform samplerBuffer u_bakedAo;

layout(location = 0) out vec3 position;
layout(location = 1) out vec3 normal;
layout(location = 2) out vec3 instanceColor;
layout(location = 3) out vec2 boxUv;
layout(location = 4) flat out int materialIndex;
layout(location = 5) out float bakedAmbientOcclusion;
layout(location = 6) flat out vec2 bakedAoFaceSize;
layout(location = 7) flat out int worldChunkIndex;
layout(location = 8) out vec3 texturePosition;

void main()
{
	vec4 worldPosition = aWorld * vec4(aPosition, 1.0);
	position = worldPosition.xyz;
	texturePosition = fract(aMaterial) > 0.125 ? mat3(aWorld) * aPosition : worldPosition.xyz;
	normal = normalize(aNormalMatrix * aNormal);
	instanceColor = aColor;
	boxUv = aTcoord;
	materialIndex = int(round(aMaterial));
	bakedAmbientOcclusion = texelFetch(u_bakedAo,
		int(aBakedAoIndex + 0.5) * 24 + gl_VertexIndex).r;
	bakedAoFaceSize = vec2(0.0);
	worldChunkIndex = int(aChunkIndex);
	gl_Position = S3DClipPosition(worldFrame.viewProjection * worldPosition);
}
