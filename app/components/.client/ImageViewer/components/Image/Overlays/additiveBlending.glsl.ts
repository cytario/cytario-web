export const shadersInject = {
  // Vertex shader: declare and pass the marker bitmask
  "vs:#decl": /* glsl */ `
        in float markerMask;
        flat out int vMarkerMask;
      `,

  "vs:#main-end": /* glsl */ `vMarkerMask = int(markerMask);`,
  // Fragment shader: receive marker mask (uniforms are now from the module)
  "fs:#decl": /* glsl */ `flat in int vMarkerMask;`,
  // Fragment color calculation: decode bitmask and blend colors (32 markers, cycling through 8 colors)
  "fs:DECKGL_FILTER_COLOR": /* glsl */ `
    // Discard fragments with no active markers
    if (vMarkerMask == 0) {
      discard;
    }

    // Populate colors array from uniforms
    vec3 colors[8];
    
    
    colors[0] = marker.color0.rgb / 255.0;
    colors[1] = marker.color1.rgb / 255.0;
    colors[2] = marker.color2.rgb / 255.0;
    colors[3] = marker.color3.rgb / 255.0;
    colors[4] = marker.color4.rgb / 255.0;
    colors[5] = marker.color5.rgb / 255.0;
    colors[6] = marker.color6.rgb / 255.0;
    colors[7] = marker.color7.rgb / 255.0;

    // Additive blending: check all 32 marker bits, cycling through 8 colors
    vec3 blendedColor = vec3(0.0);
    for (int i = 0; i < 32; i++) {
      if ((vMarkerMask & (1 << i)) != 0) {
        blendedColor += colors[i - (i / 8) * 8]; // i % 8 without modulo operator
      }
    }
    // Clamp final color to [0, 1]
    blendedColor = clamp(blendedColor, 0.0, 1.0);

    // Apply final color and opacity
    color = vec4(blendedColor, marker.opacity);
  `,
};
