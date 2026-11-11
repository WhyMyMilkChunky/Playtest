#version 460 core
#include "include/s3d_backend.glsl"
#include "include/game_model_gpu.glsl"
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in mat4 aWorld;
layout(location = 7) in vec4 aSurface;
layout(location = 8) in vec4 aContact;
layout(location = 9) in vec4 aPlane;
layout(location = 10) in vec4 aSecondary;

struct ShapeVertex
{
	vec4 position, normal;
};
S3D_RESOURCE(0, 1) layout(std430) readonly buffer VisceraShapes { ShapeVertex visceraShapes[]; };
layout(location = 0) out vec3 localPosition;
layout(location = 1) out vec3 surfaceNormal;
layout(location = 2) out vec2 uv;
layout(location = 3) flat out vec4 materialSettings;
layout(location = 4) out vec3 bodyPosition;
layout(location = 5) flat out uint goreMaterial;
layout(location = 6) out float tissueDepth;
layout(location = 15) flat out float bodyRegion;
layout(location = 16) flat out vec4 indirectRed;
layout(location = 17) flat out vec4 indirectGreen;
layout(location = 18) flat out vec4 indirectBlue;

void ClipContact(inout vec3 position, inout vec3 normal, vec4 plane)
{
	if (dot(plane.xyz, plane.xyz) < 0.5) return;
	float height = dot(position, plane.xyz) + plane.w;
	float root = sqrt(height * height + 0.0001);
	float slope = max(0.5 * (1.0 + height / root), 0.06);
	normal += plane.xyz * (dot(normal, plane.xyz) * (1.0 / slope - 1.0));
	position += plane.xyz * (0.5 * (root - height));
}

void PressContact(inout vec3 position, inout vec3 normal)
{
	if (dot(aPlane.xyz, aPlane.xyz) > 0.5)
	{
		float axial = clamp(1.0 - aContact.x, 0.62, 1.3);
		float spread = inversesqrt(axial);
		float along = dot(position, aPlane.xyz), height = along + aPlane.w;
		vec3 tangentNormal = normal - aPlane.xyz * dot(normal, aPlane.xyz);
		vec3 shear = aContact.yzw;
		float normalHeight = (dot(normal, aPlane.xyz) -
			dot(shear, tangentNormal) / spread * (height > 0.0 ? 1.0 : 0.0)) / axial;
		normal = tangentNormal / spread + aPlane.xyz * normalHeight;
		position = (position - aPlane.xyz * along) * spread +
			aPlane.xyz * (height * axial - aPlane.w) + shear * max(height, 0.0);
	}
	ClipContact(position, normal, aPlane);
	ClipContact(position, normal, aSecondary);
	ClipContact(position, normal, aPlane);
}

void main()
{
	vec3 position = aPosition, normal = aNormal;
	if (aSurface.y > 0.5)
	{
		// immutable lobes are built once; hundreds of settled chunks must not repeat their trig every frame.
		uint shape = min(uint(aSurface.z * 256.0), 255u);
#if defined(S3D_VULKAN)
		uint vertex = uint(gl_VertexIndex);
#else
		uint vertex = uint(gl_VertexID);
#endif
		ShapeVertex source = visceraShapes[shape * 240u + vertex];
		position = source.position.xyz;
		normal = source.normal.xyz;
		vec2 bend = aSurface.w * (fract(aSurface.z * vec2(19.13, 13.71)) * 2.0 - 1.0);
		normal.y -= 2.0 * position.y * dot(bend, normal.xz);
		position.xz += bend * position.y * position.y;
		PressContact(position, normal);
	}
	vec4 p = aWorld * vec4(position, 1.0);
	mat3 linear = mat3(aWorld);
	vec3 squaredScale =
	    max(vec3(dot(linear[0], linear[0]), dot(linear[1], linear[1]), dot(linear[2], linear[2])),
	        vec3(0.000001));
	localPosition = p.xyz;
	surfaceNormal = normalize(linear * (normal / squaredScale));
	uv = aUv;
	if (aSurface.y > 0.5)
	{
		// shrink the existing unwrap to the wall blood's 32px/metre grid. tissue layers stay 64px.
		vec2 arcSquared = vec2((squaredScale.x + squaredScale.z) * 0.5,
			(squaredScale.y + max(squaredScale.x, squaredScale.z)) * 0.5);
		vec2 uvScale = sqrt(arcSquared) * vec2(3.14159265, 1.57079633) * (32.0 / 64.0);
		uv = (aUv - 0.5) * uvScale + 0.5;
	}
	bodyPosition = position;
	goreMaterial = uint(aSurface.x);
	tissueDepth = 0.04;
	bodyRegion = 0.0;
	materialSettings = modelFrame.materialSettings;
	indirectRed = modelFrame.indirectRed;
	indirectGreen = modelFrame.indirectGreen;
	indirectBlue = modelFrame.indirectBlue;
	gl_Position = S3DClipPosition(modelFrame.projection * p);
}
