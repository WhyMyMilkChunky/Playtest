#version 460 core

#include "include/s3d_backend.glsl"
#include "include/game_model_gpu.glsl"

S3D_RESOURCE(0, 2) layout(std430) readonly buffer GoreGeometry { uint words[]; };

struct Corpse
{
	mat4 view;
	mat4 worlds[24];
	vec4 pieces[24];
	vec4 joints[11];
	mat4 seams[11];
	vec4 indirectRed, indirectGreen, indirectBlue;
};
S3D_RESOURCE(0, 1) layout(std430) readonly buffer GoreInstances { Corpse corpses[]; };

layout(location = 0) out vec3 localPosition;
layout(location = 1) out vec3 surfaceNormal;
layout(location = 2) out vec2 uv;
layout(location = 3) flat out vec4 materialSettings;
layout(location = 4) out vec3 bodyPosition;
layout(location = 5) flat out uint goreMaterial;
layout(location = 6) out float tissueDepth;
layout(location = 7) flat out uint woundOffset;
layout(location = 8) flat out float bodyFade;
layout(location = 15) flat out float bodyRegion;
layout(location = 16) flat out vec4 indirectRed;
layout(location = 17) flat out vec4 indirectGreen;
layout(location = 18) flat out vec4 indirectBlue;

void main()
{
	#if defined(S3D_VULKAN)
	uint vertex = uint(gl_VertexIndex);
	#else
	uint vertex = uint(gl_VertexID);
	#endif
	uint first = 4u + vertex * 13u;
	uint aPiece = words[first + 8u];
	int instance = int(S3D_INSTANCE_INDEX), piece = min(int(aPiece), 23);
	vec4 state = corpses[instance].pieces[piece];
	if (state.w <= 0.0)
	{
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	uint packedMaterial = words[first + 9u], aJoint = words[first + 10u];
	uvec4 aMaterial = uvec4(packedMaterial & 255u, (packedMaterial >> 8u) & 255u,
		(packedMaterial >> 16u) & 255u, 0u);
	vec4 joint = vec4(0.0);
	if (aJoint < 11u) joint = corpses[instance].joints[aJoint];
	bool cap = aMaterial.y != 0u;
	uint modified = uint(corpses[instance].view[0][0]);
	if ((cap && joint.z > 0.5) || (words[0] == 0u && (modified & (1u << uint(piece))) != 0u))
	{
		gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
		return;
	}
	vec3 aPosition = uintBitsToFloat(uvec3(words[first], words[first + 1u], words[first + 2u]));
	vec3 aNormal = uintBitsToFloat(uvec3(words[first + 3u], words[first + 4u], words[first + 5u]));
	vec2 aUv = uintBitsToFloat(uvec2(words[first + 6u], words[first + 7u]));
	float aBlend = uintBitsToFloat(words[first + 11u]), aDepth = uintBitsToFloat(words[first + 12u]);
	mat4 world = corpses[instance].worlds[piece];
	vec3 position = mix(state.xyz, aPosition, state.w);
	vec4 p = world * vec4(position, 1.0);
	vec3 normal = mat3(world) * aNormal;
	if (joint.z > 0.5 && aBlend > 0.0 && (uint(joint.x) == aPiece || uint(joint.y) == aPiece))
	{
		// a shared rigid rim keeps the seam welded without shearing the two limb matrices together.
		mat4 seam = corpses[instance].seams[aJoint];
		float seamWeight = clamp(aBlend * 2.0, 0.0, 1.0);
		p = mix(p, seam * vec4(position, 1.0), seamWeight);
		normal = mix(normal, mat3(seam) * aNormal, seamWeight);
	}
	bodyFade = corpses[instance].view[1].w;
	localPosition = p.xyz;
	surfaceNormal = dot(normal, normal) > 1e-12 ? normalize(normal) : vec3(0.0, 1.0, 0.0);
	uv = aUv;
	bodyPosition = aPosition;
	goreMaterial = aMaterial.x;
	tissueDepth = aDepth;
	uint marked = uint(corpses[instance].view[0][2]);
	woundOffset = (marked & (1u << uint(piece))) != 0u ?
		uint(corpses[instance].view[0][1]) + uint(piece) * 8u : 0xffffffffu;
	// expose an uneven tissue fringe when this seam opens, while intact seams stay welded.
	if (aJoint < 11u && joint.z < 0.5 && aBlend > 0.0)
	{
		float torn = fract(dot(aPosition, vec3(31.17, 47.83, 19.31)) * 13.73);
		tissueDepth = max(tissueDepth, 0.014 + torn * 0.014);
	}
	bodyRegion = float(aMaterial.z);
	materialSettings = modelFrame.materialSettings;
	indirectRed = corpses[instance].indirectRed;
	indirectGreen = corpses[instance].indirectGreen;
	indirectBlue = corpses[instance].indirectBlue;
	gl_Position = S3DClipPosition(modelFrame.projection * p);
}
