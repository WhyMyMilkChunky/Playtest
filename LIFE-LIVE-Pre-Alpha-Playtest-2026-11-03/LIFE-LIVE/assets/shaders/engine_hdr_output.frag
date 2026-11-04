#version 460 core
#include "include/s3d_backend.glsl"
layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
S3D_RESOURCE(0, 0) layout(std140) uniform HdrFrame { vec4 range; }
frame;
S3D_RESOURCE(0, 8) uniform sampler2D u_scene;
void main()
{
	vec3 encoded = max(texture(u_scene, S3DFramebufferUv(uv)).rgb, vec3(0.0));
	vec3 linearColor =
	    mix(encoded / 12.92, pow((encoded + .055) / 1.055, vec3(2.4)), step(vec3(.04045), encoded));
	float peak = max(linearColor.r, max(linearColor.g, linearColor.b));
	float limit = max(frame.range.y / frame.range.x, 1.01);
	if (peak > 1.0) linearColor *= (1.0 + (limit - 1.0) * (1.0 - exp(-(peak - 1.0) / (limit - 1.0)))) / peak;
	FragColor = vec4(linearColor * (frame.range.x / 80.0), 1.0);
}
