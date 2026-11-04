#version 460 core
#include "include/s3d_backend.glsl"
#include "include/game_reflection.glsl"
#include "include/game_surface_frame.glsl"

S3D_RESOURCE(0, 0) layout(std140) uniform SpiderFrame
{
	mat4 viewProjection;
	mat4 view;
	mat4 bones[33];
	mat4 normalBones[33];
	vec4 state;
};
#define S3D_MODEL_FRAME_BINDING 1
#include "include/game_model_gpu.glsl"
#define u_sunDirection modelFrame.sunDirection.xyz
#define u_worldUp modelFrame.worldUp.xyz
#define u_modelFxgiOnly (modelFrame.worldUp.w > .5 ? 1 : 0)
#define u_environmentColor modelFrame.environmentColor.xyz
#define u_fastSpecular int(modelFrame.environmentColor.w)
#define u_specularStrength modelFrame.materialSettings.y
#define u_lightCount int(modelFrame.materialSettings.w)
#define u_indirectRed modelFrame.indirectRed
#define u_indirectGreen modelFrame.indirectGreen
#define u_indirectBlue modelFrame.indirectBlue
vec3 ModelLightPosition(int index) { return modelFrame.lights[index].position.xyz; }
vec3 ModelLightColor(int index) { return modelFrame.lights[index].color.xyz; }
vec3 ModelLightDirection(int index) { return modelFrame.lights[index].direction.xyz; }
vec4 ModelLightParameters(int index) { return modelFrame.lights[index].parameters; }
S3D_RESOURCE(0, 2) uniform sampler2DArray u_cuticle;

layout(location = 0) in vec3 positionView;
layout(location = 1) in vec3 normalView;
layout(location = 2) in vec3 shellPosition;
layout(location = 3) flat in int material;
layout(location = 4) in vec3 tangentView;
layout(location = 5) in vec2 surfaceUv;
layout(location = 6) in vec2 furParameters;
layout(location = 0) out vec4 FragColor;

#include "include/game_spider_fur.glsl"
#define S3D_MODEL_CUSTOM_REFLECTION_ACTIVE (furParameters.x > 0.0)
#define S3D_MODEL_CUSTOM_REFLECTION SpiderFurReflection
#include "include/game_model_response.glsl"

void main()
{
	vec3 toEye = normalize(-positionView);
	vec3 geometricNormal = normalize(normalView), n = geometricNormal;
	vec2 uvDx = dFdx(surfaceUv), uvDy = S3D_DFDY(surfaceUv);
	vec3 positionDx = dFdx(positionView), positionDy = S3D_DFDY(positionView);
	bool fur = furParameters.x > 0.0;
	float furShade = 1.0;
	if (fur)
	{
		vec2 coat = SpiderFurCoverage(surfaceUv, uvDx, uvDy, furParameters.x, furParameters.y);
		if (coat.x < .5) discard;
		furShade = coat.y;
	}
	vec3 albedo = vec3(.052, .029, .018);
	float smoothness = .22, specular = .40;
	if (material <= 2)
	{
		float layer = material == 2 ? 2.0 : 0.0;
		vec4 pigment = textureGrad(u_cuticle, vec3(surfaceUv, layer), uvDx, uvDy);
		albedo = pigment.rgb;
		smoothness = pigment.a;
		if (material == 1) { albedo *= vec3(.88, .93, 1.0); smoothness *= .82; }
		if (!fur)
		{
			vec4 detail = textureGrad(u_cuticle, vec3(surfaceUv, layer + 1.0), uvDx, uvDy);
			mat3 frame = CotangentFrame(geometricNormal, positionDx, positionDy, uvDx, uvDy);
			vec3 mapped = NormalizeSurfaceDirection(frame * (detail.xyz * 2.0 - 1.0), geometricNormal);
			n = SurfaceViewNormal(geometricNormal, mapped, toEye);
			albedo *= mix(1.0, .70, furParameters.y);
		}
	}
	if (material == 3) { albedo = vec3(.008, .004, .003); smoothness = .96; }
	if (material == 4) { albedo *= .40; smoothness = .84; }
	if (fur)
	{
		vec3 fiber = normalize(tangentView);
		vec3 cylinderNormal = NormalizeSurfaceDirection(toEye - fiber * dot(toEye, fiber), geometricNormal);
		n = NormalizeSurfaceDirection(mix(geometricNormal, cylinderNormal, .35), geometricNormal);
		albedo = mix(vec3(.032, .020, .012), albedo * .58, .55) * furShade;
		smoothness = .18;
		specular = .22;
	}
	albedo *= 1.0 - state.z * .55;
	vec3 color = ModelLightingResponse(albedo, n, toEye, positionView, tangentView, specular, smoothness);
	if (material == 3) color += vec3(.16, .002, .001) * pow(max(dot(n, toEye), 0.0), 10.0);
	color += vec3(.09, .008, .002) * state.y * max(dot(n, toEye), 0.0);
	FragColor = vec4(color, 1);
}
