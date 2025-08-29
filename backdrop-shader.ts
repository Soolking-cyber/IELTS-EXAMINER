/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
const vs = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}`;

const fs = `precision highp float;

uniform vec2 resolution;
uniform float time;

// Noise functions by @patriciogv
// https://thebookofshaders.com/13/
float random (in vec2 _st) {
    return fract(sin(dot(_st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}

float noise (in vec2 _st) {
    vec2 i = floor(_st);
    vec2 f = fract(_st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.y * u.x;
}

#define NUM_OCTAVES 5

float fbm ( in vec2 _st) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5),
                    -sin(0.5), cos(0.50));
    for (int i = 0; i < NUM_OCTAVES; ++i) {
        v += a * noise(_st);
        _st = rot * _st * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}


void main() {
  vec2 st = gl_FragCoord.xy/resolution.xy*3.;
  vec3 color = vec3(0.0);

  vec2 q = vec2(0.);
  q.x = fbm( st + 0.00*time);
  q.y = fbm( st + vec2(1.0));

  vec2 r = vec2(0.);
  r.x = fbm( st + 1.0*q + vec2(1.7,9.2)+ 0.15*time );
  r.y = fbm( st + 1.0*q + vec2(8.3,2.8)+ 0.126*time);

  float f = fbm(st+r);

  color = mix(vec3(0.10, 0.30, 0.45),
              vec3(0.25, 0.50, 0.60),
              clamp((f*f)*4.0,0.0,1.0));

  color = mix(color,
              vec3(0.0,0.0,0.05),
              clamp(length(q),0.0,1.0));

  color = mix(color,
              vec3(0.8,0.9,1.0),
              clamp(length(r.x),0.0,1.0));

  gl_FragColor = vec4((f*f*f+.6*f*f+.5*f)*color, 1.);
}
`;

export {fs, vs};