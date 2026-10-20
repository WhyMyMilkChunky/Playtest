#ifndef S3D_BACKEND_GLSL
#define S3D_BACKEND_GLSL

// Descriptor sets are meaningful to Vulkan. OpenGL uses the same binding
// number as a texture/image unit and ignores the set grouping.
// Signed Y derivatives are normalized to the engine's OpenGL convention so
// derivative-built tangent frames retain the same handedness on both APIs.
#if defined(S3D_VULKAN)
	#define S3D_RESOURCE(SET_INDEX, BINDING_INDEX) \
		layout(set = SET_INDEX, binding = BINDING_INDEX)
	#define S3D_INSTANCE_INDEX gl_InstanceIndex
	#define S3D_DFDY(VALUE) (-dFdy(VALUE))

	vec4 S3DClipPosition(vec4 position)
	{
		return vec4(position.xy, (position.z + position.w) * 0.5, position.w);
	}

	vec2 S3DFramebufferUv(vec2 uv)
	{
		return vec2(uv.x, 1.0 - uv.y);
	}
#else
	#define S3D_RESOURCE(SET_INDEX, BINDING_INDEX) \
		layout(binding = BINDING_INDEX)
	#define S3D_INSTANCE_INDEX (gl_InstanceID + gl_BaseInstance)
	#define S3D_DFDY(VALUE) dFdy(VALUE)

	vec4 S3DClipPosition(vec4 position)
	{
		return position;
	}

	vec2 S3DFramebufferUv(vec2 uv)
	{
		return uv;
	}
#endif

#endif
