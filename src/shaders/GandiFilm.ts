import GandiShader from './GandiShader';

/**
 * @author LK
 */
class GandiFilm extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    uniform float u_FilmIntensity;
    uniform float u_FilmGrainStrength;
    uniform float u_FilmScanlineStrength;
    uniform float u_FilmVignetteStrength;
    uniform float u_FilmSepiaStrength;
    uniform float u_FilmTime;
    uniform vec2 u_FilmResolution;
    void main() {
        vec4 color = texture2D(u_Source, v_TexCoord);
        float grain = fract(sin(dot(v_TexCoord.xy, vec2(12.9898, 78.233))) * 43758.5453 + u_FilmTime);
        grain = grain * 2.0 - 1.0;
        vec3 grainyColor = color.rgb + grain * u_FilmGrainStrength * 0.1;
        float scanline = sin(v_TexCoord.y * u_FilmResolution.y * 3.14159) * 0.5 + 0.5;
        scanline = mix(1.0, scanline, u_FilmScanlineStrength);
        grainyColor *= scanline;
        vec2 centerDist = v_TexCoord - 0.5;
        float vignette = 1.0 - dot(centerDist, centerDist) * 1.5;
        vignette = mix(1.0, vignette, u_FilmVignetteStrength);
        grainyColor *= vignette;
        float gray = dot(grainyColor, vec3(0.299, 0.587, 0.114));
        vec3 sepia = vec3(
            min(gray * 1.20, 1.0),
            min(gray * 0.95, 1.0),
            min(gray * 0.82, 1.0)
        );
        grainyColor = mix(grainyColor, sepia, u_FilmSepiaStrength);
        vec3 resultColor = mix(color.rgb, grainyColor, u_FilmIntensity);
        gl_FragColor = vec4(resultColor, color.a);
    }
    `;

    get name (): string {
        return 'GandiFilm';
    }
}

export default GandiFilm;
