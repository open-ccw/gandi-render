import GandiShader from './GandiShader';

/**
 * @author LK
 */
class GandiGlitch extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    uniform float u_GlitchIntensity;
    uniform float u_GlitchBlockSize;
    uniform float u_GlitchSpeed;
    uniform float u_GlitchColorShift;
    uniform float u_Time;
    uniform vec2 u_GlitchResolution;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec2 texCoord = v_TexCoord;
        vec2 blockCoord = floor(texCoord * u_GlitchResolution / u_GlitchBlockSize);
        float blockRandom = random(blockCoord);
        float shift = step(0.95, random(blockCoord + u_Time * u_GlitchSpeed)) * u_GlitchIntensity;
        shift *= random(vec2(u_Time, blockCoord.y)) * 2.0 - 1.0;
        float shiftR = shift * (1.0 + u_GlitchColorShift);
        float shiftG = shift * (1.0 - u_GlitchColorShift);
        float shiftB = shift;
        float r = texture2D(u_Source, texCoord + vec2(shiftR, 0.0)).r;
        float g = texture2D(u_Source, texCoord + vec2(shiftG, 0.0)).g;
        float b = texture2D(u_Source, texCoord + vec2(shiftB, 0.0)).b;
        vec4 color = texture2D(u_Source, texCoord);
        vec3 glitchColor = vec3(r, g, b);
        vec3 resultColor = mix(color.rgb, glitchColor, u_GlitchIntensity);
        gl_FragColor = vec4(resultColor, color.a);
    }
    `;

    get name (): string {
        return 'GandiGlitch';
    }
}

export default GandiGlitch;
