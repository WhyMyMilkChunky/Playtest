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
	vec4 furSettings;
	vec4 furMotion[33];
};
#define S3D_MODEL_FRAME_BINDING 1
#include "include/game_model_gpu.glsl"
#define u_sunDirection modelFrame.sunDirection.xyz
#define u_worldUp modelFrame.worldUp.xyz
#define u_modelFxgiOnly (int(modelFrame.worldUp.w) & 1)
#define u_modelHdrOutput ((int(modelFrame.worldUp.w) & 2) != 0)
#define u_modelPowerOutage ((int(modelFrame.worldUp.w) & 4) != 0)
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
layout(location = 6) in vec4 furParameters;
layout(location = 0) out vec4 FragColor;

#include "include/game_spider_fur.glsl"
#define S3D_MODEL_CUSTOM_REFLECTION_ACTIVE (furParameters.x > 0.0 || furParameters.z > .5)
#define S3D_MODEL_CUSTOM_REFLECTION SpiderFurReflection
#define S3D_MODEL_CUSTOM_TRANSMISSION SpiderFurTransmission
#include "include/game_model_response.glsl"

void main()
{
	vec3 toEye = normalize(-positionView);
	vec3 geometricNormal = normalize(normalView), n = geometricNormal;
	vec2 uvDx = dFdx(surfaceUv), uvDy = S3D_DFDY(surfaceUv);
	vec3 positionDx = dFdx(positionView), positionDy = S3D_DFDY(positionView);
	bool fur = furParameters.x > 0.0 || furParameters.z > .5;
	vec3 coat = vec3(1.0);
	if (fur)
	{
		if (furParameters.y < .02 || furSettings.x <= 0.0) discard;
		coat = SpiderFurSample(surfaceUv, furParameters.x, furParameters.z > .5,
		    abs(dot(geometricNormal, toEye)));
		if (coat.x < .5) discard;
	}
	vec3 albedo = vec3(.033, .036, .042);
	float smoothness = .22, specular = .40;
	if (material <= 2)
	{
		float layer = material == 2 ? 2.0 : 0.0;
		vec4 pigment = textureGrad(u_cuticle, vec3(surfaceUv, layer), uvDx, uvDy);
		albedo = pigment.rgb;
		smoothness = pigment.a;
		if (material == 1)
		{
			albedo = mix(vec3(.055, .059, .065), albedo, .45);
			smoothness *= .60;
		}
		if (!fur)
		{
			vec4 detail = textureGrad(u_cuticle, vec3(surfaceUv, layer + 1.0), uvDx, uvDy);
			mat3 frame = CotangentFrame(geometricNormal, positionDx, positionDy, uvDx, uvDy);
			vec3 detailNormal = detail.xyz * 2.0 - 1.0;
			detailNormal.xy *= material == 1 ? .30 : .75;
			vec3 mapped = NormalizeSurfaceDirection(frame * detailNormal, geometricNormal);
			n = SurfaceViewNormal(geometricNormal, mapped, toEye);
			albedo *= mix(1.0, SpiderUndercoat(surfaceUv, uvDx, uvDy), furParameters.y);
		}
	}
	if (material == 3) { albedo = vec3(.008, .004, .003); smoothness = .96; }
	if (material == 4) { albedo *= .40; smoothness = .84; }
	if (fur)
	{
		vec3 fiber = normalize(tangentView);
		vec3 reference = abs(fiber.y) < .9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
		vec3 cylinder = NormalizeSurfaceDirection(toEye - fiber * dot(toEye, fiber), normalize(cross(fiber, reference)));
		vec3 facing = dot(geometricNormal, toEye) < 0.0 ? -geometricNormal : geometricNormal;
		n = NormalizeSurfaceDirection(mix(facing, cylinder, .40), facing);
		vec3 pigment = mix(vec3(.030, .033, .038), vec3(.10, .105, .115), coat.z);
		albedo = mix(albedo, pigment, .65) * coat.y;
		smoothness = .18;
		specular = .22;
	}
	albedo *= 1.0 - state.z * .15;
	vec3 color = ModelLightingResponse(albedo, n, toEye, positionView, tangentView, specular, smoothness);
	if (material == 3) color += vec3(.16, .002, .001) * pow(max(dot(n, toEye), 0.0), 10.0);
	color += vec3(.09, .008, .002) * state.y * max(dot(n, toEye), 0.0);
	FragColor = vec4(color, 1);
}
