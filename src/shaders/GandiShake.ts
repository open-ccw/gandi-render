import GandiShader from './GandiShader';

/**
 * @author LK
 */
class GandiShake extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    uniform float u_ShakeIntensity;
    uniform float u_ShakeSpeed;
    uniform float u_Time;
    uniform vec2 u_ShakeResolution;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec2 texCoord = v_TexCoord;
        float time = u_Time * u_ShakeSpeed;
        float shakeX = (random(vec2(time, 0.0)) * 2.0 - 1.0) * u_ShakeIntensity * 0.02;
        float shakeY = (random(vec2(0.0, time)) * 2.0 - 1.0) * u_ShakeIntensity * 0.02;
        vec2 offset = vec2(shakeX, shakeY);
        vec4 color = texture2D(u_Source, texCoord + offset);
        gl_FragColor = color;
    }
    `;

    get name (): string {
        return 'GandiShake';
    }
}

export default GandiShake;
