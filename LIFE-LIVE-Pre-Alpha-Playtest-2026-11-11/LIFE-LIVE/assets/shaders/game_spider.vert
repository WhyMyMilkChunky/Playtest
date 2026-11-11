#version 460 core
#include "include/s3d_backend.glsl"

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aRig;
layout(location = 3) in vec2 aSurfaceUv;
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
layout(location = 0) out vec3 positionView;
layout(location = 1) out vec3 normalView;
layout(location = 2) out vec3 shellPosition;
layout(location = 3) flat out int material;
layout(location = 4) out vec3 tangentView;
layout(location = 5) out vec2 surfaceUv;
layout(location = 6) out vec4 furParameters;

float CoatRegion(int surface, int bone, vec3 point)
{
	if (surface == 1) return .85;
	if (surface == 0) return smoothstep(-.32, -.12, point.z);
	if (surface != 2) return 0.0;
	float ends = smoothstep(0.0, .08, point.z) * (1.0 - smoothstep(.90, 1.0, point.z));
	return ends * (bone < 26 ? 1.0 : .4);
}

float CoatLength(int surface, int bone)
{
	if (surface == 1) return .27;
	if (surface == 0) return .13;
	if (surface != 2) return 0.0;
	return bone < 26 ? mix(.24, .15, float((bone - 2) % 3) * .5) : .12;
}

void main()
{
	int bone = clamp(int(aRig.x + .5), 0, 32);
	int rigMaterial = int(aRig.y + .5);
	bool fin = rigMaterial == 5;
	material = fin ? int(floor((aRig.y - 5.0) * 10.0 + .05)) : rigMaterial;
	float layers = furSettings.y;
	bool skinInstance = float(S3D_INSTANCE_INDEX) >= layers;
	if (!skinInstance && (fin || rigMaterial >= 3))
	{
		gl_Position = vec4(2, 2, 2, 1);
		return;
	}
	// the front shell blends into the head without moving the leg roots or adding another attribute.
	mat4 skin = bones[bone];
	mat3 normalSkin = mat3(normalBones[bone]);
	if (!fin && bone == 0 && aRig.x > 0.0)
	{
		float headWeight = clamp(aRig.x * 4.0, 0.0, 1.0);
		skin = skin * (1.0 - headWeight) + bones[32] * headWeight;
		normalSkin = normalSkin * (1.0 - headWeight) + mat3(normalBones[32]) * headWeight;
	}
	// the outer layers draw first; the skin fills only the holes left between strands.
	float layer = fin ? clamp(fract(aRig.x) * 4.0, 0.0, 1.0) :
	    skinInstance ? 0.0 : (layers - float(S3D_INSTANCE_INDEX) - .5) / max(layers, 1.0);
	float coat = CoatRegion(material, bone, aPosition);
	vec3 outward = normalize(normalSkin * aNormal);
	vec3 along = normalize(skin[2].xyz);
	vec3 groom = along - outward * dot(along, outward);
	if (dot(groom, groom) < .00001) groom = skin[0].xyz - outward * dot(skin[0].xyz, outward);
	groom = normalize(groom);
	vec3 flow = furMotion[bone].xyz;
	flow -= outward * dot(flow, outward);
	vec3 across = normalize(cross(outward, groom));
	float flutter = sin(state.x * 9.0 + dot(aPosition, vec3(5, 9, 7)) + float(bone) * 1.7) *
	    furMotion[bone].w * .05 * (1.0 - state.z);
	vec3 direction = outward + groom * .40 + flow + across * flutter;
	vec3 fiber = normalize(direction);
	vec4 world = skin * vec4(aPosition, 1);
	world.xyz += direction * (layer * CoatLength(material, bone) * coat * furSettings.x);
	positionView = (view * world).xyz;
	normalView = normalize(mat3(view) * outward);
	tangentView = normalize(mat3(view) * (layer > 0.0 || fin ? fiber : along));
	shellPosition = aPosition;
	surfaceUv = aSurfaceUv;
	furParameters = vec4(layer, coat, fin ? 1.0 : 0.0, float(bone));
	gl_Position = S3DClipPosition(viewProjection * world);
}
