#version 460 core
#include "include/s3d_backend.glsl"
#include "include/game_reflection.glsl"
#include "include/game_surface_frame.glsl"

S3D_RESOURCE(0, 0) layout(std140) uniform BugFrame
{
	mat4 modelView;
	mat4 projection;
	vec4 settings;
};
#define S3D_MODEL_FRAME_BINDING 2
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
#include "include/game_model_response.glsl"

layout(location = 0) in vec3 normalView;
layout(location = 1) in vec3 positionView;
layout(location = 2) in vec3 insectPosition;
layout(location = 3) flat in vec2 variationOpacity;
layout(location = 4) in vec3 tangentView;
layout(location = 0) out vec4 FragColor;

void main()
{
	// lens geometry uses screen-sized coordinates; lighting still samples near the player's face.
	vec3 lightingPosition = settings.z > .5 ? positionView * vec3(.10, .10, .30) : positionView;
	vec3 view = normalize(-lightingPosition);
	vec3 n = SurfaceViewNormal(normalize(normalView), normalize(normalView), view);
	float seed = fract(variationOpacity.x * .73);
	float segmentWidth = fwidth(insectPosition.z) * 62.83185;
	float segment = .5 + .5 * cos(insectPosition.z * 62.83185);
	float joint = mix(smoothstep(.06, .25, segment), .80, smoothstep(.4, 1.4, segmentWidth));
	float leg = smoothstep(.12, .24, abs(insectPosition.x));
	vec3 shell = mix(vec3(.055, .038, .024), vec3(.18, .13, .075), seed);
	vec3 albedo = shell * mix(.38, 1.0, joint) * mix(1.0, .65, leg);
	vec3 color = ModelLightingResponse(albedo, n, view, lightingPosition, tangentView, .48, .66);
	float alpha = clamp(variationOpacity.y, 0.0, 1.0);
	FragColor = vec4(color * alpha, alpha);
}
