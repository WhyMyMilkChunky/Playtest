#version 460 core

// Opaque geometry only. There are no material reads, discards or depth replacements.
layout(early_fragment_tests) in;
void main() {}
