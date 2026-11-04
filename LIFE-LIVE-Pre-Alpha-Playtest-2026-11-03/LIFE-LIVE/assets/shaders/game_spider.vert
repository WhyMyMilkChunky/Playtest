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
};
layout(location = 0) out vec3 positionView;
layout(location = 1) out vec3 normalView;
layout(location = 2) out vec3 shellPosition;
layout(location = 3) flat out int material;
layout(location = 4) out vec3 tangentView;
layout(location = 5) out vec2 surfaceUv;
layout(location = 6) out vec2 furParameters;

void main()
{
	int bone = clamp(int(aRig.x + .5), 0, 32);
	// the front shell blends into the head without moving the leg roots or adding another attribute.
	mat4 skin = bones[bone];
	mat3 normalSkin = mat3(normalBones[bone]);
	if (bone == 0 && aRig.x > 0.0)
	{
		float headWeight = clamp(aRig.x * 4.0, 0.0, 1.0);
		skin = skin * (1.0 - headWeight) + bones[32] * headWeight;
		normalSkin = normalSkin * (1.0 - headWeight) + mat3(normalBones[32]) * headWeight;
	}
	material = int(aRig.y + .5);
	float shells = max(floor(state.w + .5), 1.0);
	float shell = float(S3D_INSTANCE_INDEX);
	// outer shells go first so their opaque strands reject hidden inner fragments.
	float layer = shell < shells ? (shells - shell - .5) / shells : 0.0;
	float coat = material == 1 ? 1.0 : material == 2 ? (bone < 26 ? 1.0 : .45) :
	    material == 0 ? smoothstep(-.40, -.20, aPosition.z) : 0.0;
	float coatLength = material == 2 ? mix(.030, .018, float(max(bone - 2, 0) % 3) * .5) : .036;
	vec3 outward = normalize(aNormal);
	vec3 comb = vec3(0, 0, 1) - outward * outward.z;
	comb = dot(comb, comb) > .00001 ? normalize(comb) : vec3(1, 0, 0);
	vec3 offset = (outward * layer + comb * (layer * layer * .45)) * (coatLength * coat);
	vec4 world = skin * vec4(aPosition + offset, 1);
	positionView = (view * world).xyz;
	normalView = normalize(mat3(view) * normalSkin * aNormal);
	tangentView = layer > 0.0 ? normalize(mat3(view) * mat3(skin) * (outward + comb * layer * .90)) :
	    normalize(mat3(view) * skin[2].xyz);
	shellPosition = aPosition;
	surfaceUv = aSurfaceUv;
	furParameters = vec2(layer, coat);
	gl_Position = S3DClipPosition(viewProjection * world);
	if (layer > 0.0 && material >= 3) gl_Position = vec4(2, 2, 2, 1);
}
