#version 460 core

#include "include/s3d_backend.glsl"

layout(location = 0) in vec2 uv;
layout(location = 0) out vec4 FragColor;
layout(binding = 0, std140) uniform CameraFrameBlock
{
	mat4 inverseViewProjection;
	mat4 previousViewProjection;
	vec4 projectionSize; // Projection Z coefficients, source width/height.
	vec4 motion; // Shutter fraction, pixel limit, maximum tap count, reserved.
	vec4 proximity; // Strength, near/far distance, softening radius in source pixels.
	vec4 encoding;
} cameraFrame;

S3D_RESOURCE(0, 8) uniform sampler2D u_scene;
S3D_RESOURCE(0, 9) uniform sampler2D u_depth;

vec3 LinearScene(vec2 point)
{
	vec3 color = texture(u_scene, point).rgb;
	return cameraFrame.encoding.x > .5 ? color * color : color;
}

float EyeDepth(float depth)
{
	return abs(cameraFrame.projectionSize.y / min(depth * 2.0 - 1.0 + cameraFrame.projectionSize.x, -.000001));
}

float DepthConfidence(vec2 point, float reciprocalDepth, vec2 gradient)
{
	vec2 offsetPixels = (point - uv) * cameraFrame.projectionSize.zw;
	// Reciprocal depth is linear over a projected plane. Extrapolating linear eye
	// distance incorrectly rejects the very surfaces that sweep past the camera.
	float expected = reciprocalDepth + dot(gradient, offsetPixels);
	if (expected <= .000001) return 0.0;
	float neighbor = 1.0 / EyeDepth(texture(u_depth, point).r);
	float relativeError = abs(neighbor - expected) / max(expected, .000001);
	float tolerance = max(.018, reciprocalDepth * .025);
	return 1.0 - smoothstep(tolerance, tolerance * 3.0, relativeError);
}

vec2 CameraTrail(float depth)
{
	if (cameraFrame.motion.x <= .0001 || depth >= .999999) return vec2(0.0);
	vec4 world = cameraFrame.inverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
	vec4 previous = cameraFrame.previousViewProjection * world;
	if (previous.w <= .0001) return vec2(0.0);
	vec2 trail = (previous.xy / previous.w * .5 + .5 - uv) * cameraFrame.motion.x;
	float pixels = length(trail * cameraFrame.projectionSize.zw);
	trail *= min(1.0, cameraFrame.motion.y / max(pixels, .0001));
	// Retain a steadier sight picture without a hard, circular boundary around the crosshair.
	float peripheral = smoothstep(.0, .60, length((uv - .5) * 2.0));
	return trail * mix(.45, 1.0, peripheral);
}

bool InsideScene(vec2 point)
{
	vec2 halfTexel = .5 / cameraFrame.projectionSize.zw;
	return all(greaterThanEqual(point, halfTexel)) && all(lessThanEqual(point, 1.0 - halfTexel));
}

void GatherMotion(vec2 point, float shutterWeight, float reciprocalDepth, vec2 gradient,
	inout vec3 sum, inout float weight, inout bool open)
{
	if (!open) return;
	if (!InsideScene(point)) { open = false; return; }
	float confidence = DepthConfidence(point, reciprocalDepth, gradient);
	// Stop this half of the trail at a silhouette instead of sampling past a railing/wall.
	if (confidence <= .025) { open = false; return; }
	float contribution = confidence * shutterWeight;
	sum += LinearScene(point) * contribution;
	weight += contribution;
}

vec3 MotionResponse(vec3 center, vec2 trail, float reciprocalDepth, vec2 gradient)
{
	float pixels = length(trail * cameraFrame.projectionSize.zw);
	if (pixels <= .40) return center;
	int maximumPairs = clamp((int(cameraFrame.motion.z) - 1) / 2, 1, 13);
	int pairs = min(maximumPairs, max(int(ceil(pixels * .65)), 2));
	vec3 sum = center;
	float weight = 1.0;
	bool forwardOpen = true, backwardOpen = true;
	// A fixed per-pixel phase breaks up sparse repeated copies without temporal noise.
	float phase = fract(dot(floor(gl_FragCoord.xy), vec2(.754877666, .569840296))) * .30 + .35;
	for (int tap = 0; tap < 13; ++tap)
	{
		if (tap >= pairs || (!forwardOpen && !backwardOpen)) break;
		float along = (float(tap) + phase) / float(pairs) * .5;
		float shutterWeight = 1.0 - smoothstep(.30, .55, along) * .50;
		GatherMotion(uv + trail * along, shutterWeight, reciprocalDepth, gradient, sum, weight, forwardOpen);
		GatherMotion(uv - trail * along, shutterWeight, reciprocalDepth, gradient, sum, weight, backwardOpen);
	}
	// A centered shutter avoids shifting the scene sideways as blur strength changes.
	return mix(center, sum / weight, smoothstep(.40, 1.25, pixels));
}

vec3 ProximityResponse(vec3 color, float depth, float reciprocalDepth, vec2 gradient)
{
	vec2 edge = abs(uv * 2.0 - 1.0);
	float peripheral = smoothstep(.48, .98, max(edge.x, edge.y));
	float close = 1.0 - smoothstep(cameraFrame.proximity.y, cameraFrame.proximity.z, depth);
	float amount = peripheral * close * cameraFrame.proximity.x;
	if (amount <= .001) return color;
	const vec2 offsets[4] = vec2[4](vec2(-1, 0), vec2(1, 0), vec2(0, -1), vec2(0, 1));
	vec3 softened = color;
	float weight = 1.0;
	vec2 radius = cameraFrame.proximity.w / cameraFrame.projectionSize.zw;
	vec2 halfTexel = .5 / cameraFrame.projectionSize.zw;
	for (int tap = 0; tap < 4; ++tap)
	{
		vec2 point = clamp(uv + offsets[tap] * radius, halfTexel, 1.0 - halfTexel);
		float confidence = DepthConfidence(point, reciprocalDepth, gradient);
		if (confidence <= .001) continue;
		softened += LinearScene(point) * confidence;
		weight += confidence;
	}
	return mix(color, softened / weight, amount * .48) * (1.0 - amount * .18);
}

void main()
{
	float rawDepth = texture(u_depth, uv).r;
	float depth = EyeDepth(rawDepth);
	float reciprocalDepth = 1.0 / max(depth, .000001);
	// Derivatives are evaluated before any per-pixel branch; slopes keep planar surfaces coherent.
	vec2 gradient = vec2(dFdx(reciprocalDepth), dFdy(reciprocalDepth));
	vec3 color = LinearScene(uv);
	color = MotionResponse(color, CameraTrail(rawDepth), reciprocalDepth, gradient);
	color = ProximityResponse(color, depth, reciprocalDepth, gradient);
	FragColor = vec4(cameraFrame.encoding.x > .5 ? sqrt(max(color, vec3(0.0))) : color, 1.0);
}
