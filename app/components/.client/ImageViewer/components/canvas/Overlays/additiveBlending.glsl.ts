export const shadersInject = {
  // Vertex shader: declare and pass the marker bitmask
  "vs:#decl": /* glsl */ `
        in float markerMask;
        flat out int vMarkerMask;
      `,

  "vs:#main-end": /* glsl */ `vMarkerMask = int(markerMask);`,
  // Fragment shader: receive marker mask (uniforms are now from the module)
  "fs:#decl": /* glsl */ `flat in int vMarkerMask;`,
  // Fragment color calculation: decode bitmask and blend colors (32 markers, one color per marker)
  "fs:DECKGL_FILTER_COLOR": /* glsl */ `
    // Discard fragments with no active markers
    if (vMarkerMask == 0) {
      discard;
    }

    // Populate colors array from uniforms
    vec3 colors[32];
    colors[0] = marker.color0.rgb / 255.0;
    colors[1] = marker.color1.rgb / 255.0;
    colors[2] = marker.color2.rgb / 255.0;
    colors[3] = marker.color3.rgb / 255.0;
    colors[4] = marker.color4.rgb / 255.0;
    colors[5] = marker.color5.rgb / 255.0;
    colors[6] = marker.color6.rgb / 255.0;
    colors[7] = marker.color7.rgb / 255.0;
    colors[8] = marker.color8.rgb / 255.0;
    colors[9] = marker.color9.rgb / 255.0;
    colors[10] = marker.color10.rgb / 255.0;
    colors[11] = marker.color11.rgb / 255.0;
    colors[12] = marker.color12.rgb / 255.0;
    colors[13] = marker.color13.rgb / 255.0;
    colors[14] = marker.color14.rgb / 255.0;
    colors[15] = marker.color15.rgb / 255.0;
    colors[16] = marker.color16.rgb / 255.0;
    colors[17] = marker.color17.rgb / 255.0;
    colors[18] = marker.color18.rgb / 255.0;
    colors[19] = marker.color19.rgb / 255.0;
    colors[20] = marker.color20.rgb / 255.0;
    colors[21] = marker.color21.rgb / 255.0;
    colors[22] = marker.color22.rgb / 255.0;
    colors[23] = marker.color23.rgb / 255.0;
    colors[24] = marker.color24.rgb / 255.0;
    colors[25] = marker.color25.rgb / 255.0;
    colors[26] = marker.color26.rgb / 255.0;
    colors[27] = marker.color27.rgb / 255.0;
    colors[28] = marker.color28.rgb / 255.0;
    colors[29] = marker.color29.rgb / 255.0;
    colors[30] = marker.color30.rgb / 255.0;
    colors[31] = marker.color31.rgb / 255.0;

    // Additive blending: check all 32 marker bits, one color per marker
    vec3 blendedColor = vec3(0.0);
    for (int i = 0; i < 32; i++) {
      if ((vMarkerMask & (1 << i)) != 0) {
        blendedColor += colors[i];
      }
    }
    // Clamp final color to [0, 1]
    blendedColor = clamp(blendedColor, 0.0, 1.0);

    // Apply final color and opacity
    color = vec4(blendedColor, marker.opacity);
  `,
};
