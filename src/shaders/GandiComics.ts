import GandiShader from './GandiShader';

/**
 * @author LK
 */
class GandiComics extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    uniform float u_ComicsIntensity;
    uniform float u_ComicsColorLevels;
    uniform float u_ComicsEdgeThreshold;
    uniform float u_ComicsEdgeStrength;
    uniform float u_ComicsResolution;
    void main() {
        vec4 color = texture2D(u_Source, v_TexCoord);
        vec2 resolution = vec2(u_ComicsResolution, u_ComicsResolution);
        vec2 texCoord = v_TexCoord;
        float dx = 1.0 / resolution.x;
        float dy = 1.0 / resolution.y;
        vec4 horiz = texture2D(u_Source, texCoord + vec2(-dx, 0.0)) +
                     texture2D(u_Source, texCoord + vec2( dx, 0.0));
        vec4 vert  = texture2D(u_Source, texCoord + vec2(0.0, -dy)) +
                     texture2D(u_Source, texCoord + vec2(0.0,  dy));
        vec4 diag1 = texture2D(u_Source, texCoord + vec2(-dx, -dy)) +
                     texture2D(u_Source, texCoord + vec2( dx,  dy));
        vec4 diag2 = texture2D(u_Source, texCoord + vec2( dx, -dy)) +
                     texture2D(u_Source, texCoord + vec2(-dx,  dy));
        vec4 edge = abs(horiz + vert + diag1 + diag2 - 8.0 * color);
        float edgeStrength = length(edge.rgb);
        float toonR = floor(color.r * u_ComicsColorLevels) / u_ComicsColorLevels;
        float toonG = floor(color.g * u_ComicsColorLevels) / u_ComicsColorLevels;
        float toonB = floor(color.b * u_ComicsColorLevels) / u_ComicsColorLevels;
        vec3 toonColor = vec3(toonR, toonG, toonB);
        vec3 resultColor = mix(toonColor, color.rgb, 1.0 - u_ComicsIntensity);
        float edgeFactor;
        if (edgeStrength > u_ComicsEdgeThreshold) {
            edgeFactor = mix(1.0, 1.0 - u_ComicsEdgeStrength, smoothstep(u_ComicsEdgeThreshold, u_ComicsEdgeThreshold + 0.1, edgeStrength));
        } else {
            edgeFactor = 1.0;
        }
        resultColor *= edgeFactor;
        resultColor = mix(color.rgb, resultColor, u_ComicsIntensity);
        gl_FragColor = vec4(resultColor, color.a);
    }
    `;

    get name (): string {
        return 'GandiComics';
    }
}

export default GandiComics;
