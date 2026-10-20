#version 460 core
#include "include/s3d_backend.glsl"
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
layout(location = 3) in mat4 aWorld;
S3D_RESOURCE(0, 0) layout(std140) uniform GibFrame { mat4 viewProjection; } frame;
layout(location = 0) out vec2 uv;
layout(location = 1) out float light;
void main()
{
    uv = aUv;
    vec3 normal = normalize(mat3(aWorld) * aNormal);
    light = 0.38 + 0.62 * max(dot(normal, normalize(vec3(0.3, 1.0, 0.2))), 0.0);
    gl_Position = S3DClipPosition(frame.viewProjection * aWorld * vec4(aPosition, 1.0));
}
