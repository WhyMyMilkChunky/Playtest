#ifndef S3D_GAME_WORLD_GPU_GLSL
#define S3D_GAME_WORLD_GPU_GLSL

struct S3DWorldLight
{
	vec4 position;  // xyz: world position; w: emitting-disc radius squared.
	vec4 color;     // xyz: light color; w: inverse attenuation range.
	vec4 direction; // xyz: unit beam direction; w: inverse cone-fade width.
	vec4 parameters;
	ivec4 shadow;
	uvec4 movingMask;
};

S3D_RESOURCE(0, 0) layout(std140) uniform S3DWorldFrameBlock
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
	ivec4 structuralMaterials[2];
	ivec4 emissiveImageMaterials[2];
	S3DWorldLight lights[24];
	vec4 shadowPositionFar[24];
	vec4 fxgiSettings; // enabled, strength, fxgi-only, face count.
	vec4 fxgiDebug;    // reserved, moving blocker count, direct visibility enabled, HDR output.
	vec4 lightingLod;  // full-detail distance, fade end, distant light budget, enabled.
	vec4 livingEye;    // twilight strength, previous adaptation texture index, outage, red event.
	mat4 movingBlockers[64];
}
worldFrame;

struct S3DWorldChunk
{
	ivec4 header;
	ivec4 lightIndices[6];
	vec4 minimum;
	vec4 maximum;
	vec4 gridMinimum;
	vec4 gridScale;
	ivec4 gridHeader;
	ivec4 gridLightSlots[6];
};

S3D_RESOURCE(0, 1) layout(std430) readonly buffer S3DWorldChunkBuffer { S3DWorldChunk worldChunks[]; };

int S3DWorldLightingMode(int chunk)
{
	if (worldFrame.lightingLod.w < 0.5 || chunk < 0) return 0;
	vec3 minimum = worldChunks[chunk].minimum.xyz, maximum = worldChunks[chunk].maximum.xyz;
	vec3 camera = worldFrame.cameraPosition.xyz;
	vec3 farthest = max(abs(minimum - camera), abs(maximum - camera));
	if (dot(farthest, farthest) <= worldFrame.lightingLod.x * worldFrame.lightingLod.x) return 0;
	vec3 nearest = max(max(minimum - camera, camera - maximum), vec3(0.0));
	return dot(nearest, nearest) >= worldFrame.lightingLod.y * worldFrame.lightingLod.y ? 2 : 1;
}

#endif
