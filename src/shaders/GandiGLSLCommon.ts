/**
 * Common GLSL shaders used by Gandi effects.
 */
const GandiGLSLCommon = {
  VERT_SHADER_SRC: `
    precision mediump float;
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_TexCoord;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_TexCoord = a_texCoord;
    }
    `,

  GET_UV_FROM_TEXEL: `
    vec2 getUVFromTexel(vec2 texSize) {
        return 1.0 / texSize;
    }
    `,

  GET_PIXEL_FROM_UV: `
    vec2 getPixelFromUV(vec2 texSize) {
        return texSize;
    }
    `,

  GET_UV_FROM_PIXEL: `
    vec2 getUVFromPixel(vec2 texSize) {
        return 1.0 / texSize;
    }
    `,
} as const;

export default GandiGLSLCommon;
