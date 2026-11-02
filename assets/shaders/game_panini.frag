#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) out vec4 FragColor;
layout(location = 0) in vec2 uv;

#if defined(S3D_VULKAN)
layout(set = 0, binding = 0, std140)
#else
layout(binding = 0, std140)
#endif
    uniform PaniniFrameBlock
{
	vec4 projection;
	vec4 tuning;
}
paniniFrame;
S3D_RESOURCE(0, 1) uniform sampler2D u_scene;

void main()
{
	float tanHalfHorizontal = paniniFrame.projection.x;
	float distance = paniniFrame.projection.y;
	float verticalSqueeze = paniniFrame.projection.z;
	float edgeCrop = paniniFrame.projection.w;
	float edgePanini = paniniFrame.tuning.x;
	float edgeVerticalScale = paniniFrame.tuning.y;
	vec2 outputNdc = uv * 2.0 - 1.0;

	float paniniX = outputNdc.x * edgePanini;
	float k = paniniX / (distance + 1.0);
	// Solve k = sin(phi) / (distance + cos(phi)) directly. This preserves
	// the projection without atan/asin/cos/tan in every fullscreen fragment.
	float kSquared = k * k;
	float cosine = (sqrt(max(1.0 + kSquared * (1.0 - distance * distance), 0.0)) - kSquared * distance) /
	               (1.0 + kSquared);
	float phiCosine = max(cosine, 0.0001);
	float projectedX = k * (distance + cosine) / max(cosine * tanHalfHorizontal, 0.000001);

	vec2 sourceNdc;
	sourceNdc.x = projectedX;
	float verticalScale = (distance + phiCosine) / ((distance + 1.0) * phiCosine);
	sourceNdc.y = outputNdc.y * mix(1.0, verticalScale / edgeVerticalScale, verticalSqueeze);
	sourceNdc *= 1.0 - edgeCrop;

	vec2 sourceUv = clamp(sourceNdc * 0.5 + 0.5, 0.0, 1.0);
	FragColor = texture(u_scene, S3DFramebufferUv(sourceUv));
}
