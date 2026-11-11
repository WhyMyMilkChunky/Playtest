#version 460 core
#include "include/game_colony_frame.glsl"

layout(location = 0) in vec3 insectPosition;
layout(location = 1) in vec3 worldPosition;
layout(location = 2) in vec3 worldNormal;
layout(location = 3) flat in vec4 insectInfo;
layout(location = 4) in vec3 bodyPosition;
layout(location = 5) in float insectCoverage;
layout(location = 0) out vec4 FragColor;

void main()
{
	if (insectCoverage < .5) discard;
	float segmentWidth = fwidth(insectPosition.z) * 62.83185;
	float segment = .5 + .5 * cos(insectPosition.z * 62.83185);
	float joint = mix(smoothstep(.04, .23, segment), .80, smoothstep(.4, 1.4, segmentWidth));
	float leg = smoothstep(.105, .22, abs(insectPosition.x));
	float seed = fract(insectInfo.y * .01), edge = insectInfo.w;
	vec3 shell = mix(vec3(.055, .032, .018), vec3(.24, .16, .075), seed);
	shell = mix(shell, vec3(.32, .29, .18), smoothstep(.90, 1.0, seed) * .55);
	vec3 albedo = shell * mix(.20, 1.0, joint) * mix(1.0, .52, leg) * edge;
	vec3 toEye = eyeTime.xyz - worldPosition;
	float distance = max(length(toEye), .001);
	vec3 view = toEye / distance, n = normalize(worldNormal);
	float spot = smoothstep(.80, .94, dot(-view, forwardFlash.xyz));
	float light = spot * forwardFlash.w * 4.1 / (1.0 + distance * distance * .018) + motion.y * 3.0;
	float facing = max(dot(n, view), 0.0);
	float shine = pow(facing, mix(24.0, 46.0, seed)) * joint * (1.0 - leg * .7) * .42 * edge;
	float rim = pow(clamp(1.0 - abs(dot(n, view)), 0.0, 1.0), 3.0);
	vec3 color = albedo * (.12 + light * (.18 + facing)) + vec3(1.0, .88, .68) * shine * light;
	for (int i = 0; i < int(counts.z); ++i)
	{
		vec3 delta = pointPositions[i].xyz - worldPosition;
		float lengthSquared = max(dot(delta, delta), .0001);
		float reach = max(pointPositions[i].w, .001);
		float attenuation = max(0.0, 1.0 - lengthSquared / (reach * reach));
		attenuation = attenuation * attenuation / (1.0 + lengthSquared * .025);
		vec3 direction = delta * inversesqrt(lengthSquared);
		vec3 energy = pointColors[i].rgb * pointColors[i].w * attenuation;
		color += albedo * energy * (.15 + max(dot(n, direction), 0.0));
		vec3 halfSum = direction + view;
		vec3 halfway = dot(halfSum, halfSum) > .0001 ? normalize(halfSum) : n;
		color += energy * pow(max(dot(n, halfway), 0.0), 28.0) * joint * .12 * (1.0 - leg);
	}
	color += vec3(.014, .022, .017) * rim;
	FragColor = vec4(color, 1);
}
