import GandiShader from './GandiShader';

/**
 * @author LK
 * Sync shader for passing through render.
 */
class GandiSync extends GandiShader {
    static readonly FRAG_SHADER_SRC: string = `
    precision mediump float;
    uniform sampler2D u_Source;
    varying vec2 v_TexCoord;
    void main() {
        vec4 color = texture2D(u_Source, v_TexCoord);
        gl_FragColor = color;
    }
    `;

    get name (): string {
        return 'GandiSync';
    }
}

export default GandiSync;
