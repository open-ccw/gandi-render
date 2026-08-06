import GandiShader from './GandiShader';

/**
 * @author LK
 */
class GandiShockWave extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    uniform float u_ShockWaveIntensity;
    uniform float u_ShockWaveCenterX;
    uniform float u_ShockWaveCenterY;
    uniform float u_ShockWaveRadius;
    uniform float u_ShockWaveTime;
    uniform float u_ShockWaveWidth;
    uniform vec2 u_ShockWaveResolution;
    void main() {
        vec2 center = vec2(u_ShockWaveCenterX, u_ShockWaveCenterY);
        vec2 texCoord = v_TexCoord;
        float dist = distance(texCoord, center);
        float waveRadius = u_ShockWaveRadius;
        float time = u_ShockWaveTime;
        float waveWidth = u_ShockWaveWidth;
        float wave = sin(dist * 50.0 - time * 5.0) * u_ShockWaveIntensity * 0.02;
        float waveEffect;
        if (dist > waveRadius - waveWidth && dist < waveRadius + waveWidth) {
            waveEffect = wave;
        } else {
            waveEffect = 0.0;
        }
        vec2 offset = vec2(waveEffect, waveEffect);
        vec4 color = texture2D(u_Source, texCoord + offset);
        gl_FragColor = color;
    }
    `;

    get name (): string {
        return 'GandiShockWave';
    }
}

export default GandiShockWave;
