import GandiShader from './GandiShader';

/**
 * @author LK
 */
class GandiShadow extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    uniform float u_ShadowIntensity;
    uniform float u_ShadowOffsetX;
    uniform float u_ShadowOffsetY;
    uniform float u_ShadowBlur;
    uniform vec4 u_ShadowColor;
    uniform vec2 u_ShadowResolution;
    void main() {
        vec4 color = texture2D(u_Source, v_TexCoord);
        vec2 texelSize = 1.0 / u_ShadowResolution;
        vec2 offset = vec2(u_ShadowOffsetX, u_ShadowOffsetY) * texelSize;
        float blur = u_ShadowBlur * 0.01;
        vec4 shadowColor = vec4(0.0);
        float totalWeight = 0.0;
        for (float i = -blur; i <= blur; i += texelSize.x) {
            for (float j = -blur; j <= blur; j += texelSize.y) {
                vec2 sampleOffset = offset + vec2(i, j);
                float weight = 1.0 / (1.0 + length(sampleOffset) * 10.0);
                shadowColor += texture2D(u_Source, v_TexCoord + sampleOffset) * weight;
                totalWeight += weight;
            }
        }
        shadowColor /= totalWeight;
        shadowColor = mix(vec4(u_ShadowColor.rgb, shadowColor.a * u_ShadowColor.a),
                         vec4(0.0, 0.0, 0.0, 0.0),
                         1.0 - u_ShadowIntensity);
        vec3 resultColor;
        if (color.a > 0.0) {
            resultColor = color.rgb;
        } else {
            resultColor = mix(color.rgb, shadowColor.rgb, shadowColor.a);
        }
        float resultAlpha = max(color.a, shadowColor.a);
        gl_FragColor = vec4(resultColor, resultAlpha);
    }
    `;

    get name (): string {
        return 'GandiShadow';
    }
}

export default GandiShadow;
