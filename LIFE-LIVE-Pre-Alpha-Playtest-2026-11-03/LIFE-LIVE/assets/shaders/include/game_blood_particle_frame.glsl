#ifndef S3D_BLOOD_PARTICLE_FRAME_GLSL
#define S3D_BLOOD_PARTICLE_FRAME_GLSL

#include "s3d_backend.glsl"

S3D_RESOURCE(0, 0) layout(std140) uniform BloodParticleFrame
{
	mat4 u_viewProjection;
	vec4 cameraRight;
	vec4 cameraUp;
	mat4 u_view;
	vec4 worldUpSpecular;
	vec4 environmentCount;
	vec4 sunDetailed;
	vec3 u_lightPositions[24];
	vec3 u_lightColors[24];
	vec3 u_lightDirections[24];
	vec4 u_lightParameters[24];
};
#define u_cameraRight cameraRight.xyz
#define u_cameraUp cameraUp.xyz
#define u_worldUp worldUpSpecular.xyz
#define u_specularStrength worldUpSpecular.w
#define u_environmentColor environmentCount.xyz
#define u_lightCount int(environmentCount.w)
#define u_sunDirection sunDetailed.xyz
#define u_detailedSpecular int(sunDetailed.w)

#endif
