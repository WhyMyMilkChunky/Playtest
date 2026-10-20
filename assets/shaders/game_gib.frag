#version 460 core
#include "include/s3d_backend.glsl"
#include "include/s3d_pixel_grid.glsl"
S3D_RESOURCE(0, 1) uniform sampler2D gibTexture;
layout(location = 0) in vec2 uv;
layout(location = 1) in float light;
layout(location = 0) out vec4 color;
void main()
{
	vec2 materialTextureSize = vec2(textureSize(gibTexture, 0));
	vec2 texelScreenOffset = S3DTexelScreenOffset(uv, materialTextureSize);
	float texelLight = clamp(S3DTexelValue(light, texelScreenOffset), 0.0, 1.0);
	color = vec4(texture(gibTexture, uv).rgb * texelLight, 1.0);
}
