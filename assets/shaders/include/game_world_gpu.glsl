#ifndef S3D_GAME_WORLD_GPU_GLSL
#define S3D_GAME_WORLD_GPU_GLSL

struct S3DWorldLight
{
	vec4 position; // xyz: world position; w: emitting-disc radius squared.
	vec4 color; // xyz: light color; w: inverse attenuation range.
	vec4 direction; // xyz: unit beam direction; w: inverse cone-fade width.
	vec4 parameters;
	ivec4 shadow;
};

S3D_RESOURCE(0, 0) uniform S3DWorldFrameBlock
{
	mat4 viewProjection;
	vec4 sunDirection;
	vec4 cameraPosition; // xyz: camera; w: persistent blood mask enabled.
	vec4 fogColor;
	vec4 renderSettings;
	vec4 aoSettings;
	ivec4 materialIds0;
	ivec4 materialIds1;
	ivec4 counts;
	vec4 shadowSettings;
	ivec4 structuralMaterials;
	ivec4 emissiveImageMaterials;
	S3DWorldLight lights[24];
	vec4 shadowPositionFar[24];
} worldFrame;

struct S3DWorldChunk
{
	ivec4 header;
	ivec4 lightIndices[6];
};

S3D_RESOURCE(0, 1) readonly buffer S3DWorldChunkBuffer
{
	S3DWorldChunk worldChunks[];
};

#endif
