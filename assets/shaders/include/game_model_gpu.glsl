#ifndef S3D_GAME_MODEL_GPU_GLSL
#define S3D_GAME_MODEL_GPU_GLSL

struct S3DModelLight
{
	vec4 position;
	vec4 color;
	vec4 direction;
	vec4 parameters;
};

S3D_RESOURCE(0, 0) layout(std140) uniform S3DModelFrameBlock
{
	mat4 projection;
	vec4 sunDirection;
	vec4 worldUp;
	vec4 environmentColor;
	vec4 materialSettings;
	S3DModelLight lights[24];
} modelFrame;

#endif
