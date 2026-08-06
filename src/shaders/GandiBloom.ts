import GandiShader from './GandiShader';

/**
 * @author LK
 */
class GandiBloom extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    uniform float u_BloomIntensity;
    uniform float u_BloomThreshold;
    uniform float u_BloomRadius;
    uniform float u_BloomStep;
    uniform float u_BloomGamma;
    uniform float u_BloomExposure;
    void main() {
        vec4 color = texture2D(u_Source, v_TexCoord);
        float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        if (brightness > u_BloomThreshold) {
            float alpha = u_BloomIntensity;
            float size = u_BloomRadius;
            vec2 texCoord = v_TexCoord;
            vec4 bloomColor = vec4(0.0);
            for (float i = -size; i <= size; i += u_BloomStep) {
                for (float j = -size; j <= size; j += u_BloomStep) {
                    vec2 offset = vec2(i, j);
                    bloomColor += texture2D(u_Source, texCoord + offset);
                }
            }
            bloomColor /= (2.0 * size / u_BloomStep + 1.0) * (2.0 * size / u_BloomStep + 1.0);
            bloomColor = mix(color, bloomColor, alpha);
            bloomColor.rgb = vec3(1.0) - exp(-bloomColor.rgb * u_BloomExposure);
            bloomColor.rgb = pow(bloomColor.rgb, vec3(1.0 / u_BloomGamma));
            gl_FragColor = bloomColor;
        } else {
            gl_FragColor = color;
        }
    }
    `;

    get name (): string {
        return 'GandiBloom';
    }
}

export default GandiBloom;
