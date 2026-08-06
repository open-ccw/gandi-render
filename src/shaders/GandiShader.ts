// @ts-ignore
import * as twgl from 'twgl.js';
import GandiGLSLCommon from './GandiGLSLCommon';

/**
 * @author LK
 *
 * Base class for a Gandi post-processing shader (effector).
 *
 * The JS-era effector pipeline (`GandiShaderManager`) drives each effector by
 * calling `render()` for every registered post-processing pass. Each effector
 * reads the previously rendered scene from `_render.fbo.attachments[0]` as
 * `u_Source` and writes its result to the currently bound framebuffer.
 *
 * Subclasses only need to define a static `FRAG_SHADER_SRC` (a full fragment
 * shader that samples `u_Source` and uses the `v_TexCoord` varying) and
 * override `get name()`.
 */
class GandiShader {
    static readonly POST_INPUT_NAME: string = 'u_Source';

    _renderer: any;
    _gl: WebGLRenderingContext;
    _bufferInfo: any;
    _name: string;
    _type: string;
    _uniforms: Record<string, any>;
    _initialUniforms: Record<string, any>;
    _program: any;
    _enabled: boolean;
    _dirty: boolean;
    _fbo: any;

    /**
     * True while this effector is bypassed (skipped). Mirrors the JS effector API.
     */
    bypass: boolean;
    /**
     * True while this effector wants to be re-rendered. Mirrors the JS effector API.
     */
    dirty: boolean;

    constructor (renderer: any, bufferInfo: any = null) {
        this._renderer = renderer;
        this._gl = renderer._gl;
        this._bufferInfo = bufferInfo;
        this._name = '';
        this._type = '';

        this._uniforms = {};
        this._initialUniforms = {};

        this._program = null;
        this._enabled = false;
        this._dirty = false;
        this._fbo = null;

        this.bypass = true;
        this.dirty = false;

        // Build the program lazily in isSupported/getProgram so the renderer can
        // tolerate effectors that are registered but never used.
    }

    get name (): string {
        return this._name;
    }

    set name (value: string) {
        this._name = value;
    }

    get type (): string {
        return this._type;
    }

    get enabled (): boolean {
        return this._enabled;
    }

    set enabled (value: boolean) {
        if (this._enabled !== value) {
            this._enabled = value;
            this.setDirty();
        }
    }

    get uniforms (): Record<string, any> {
        return this._uniforms;
    }

    set uniforms (value: Record<string, any>) {
        if (this._uniforms !== value) {
            this._uniforms = value;
            this.setDirty();
        }
    }

    setDirty (): void {
        this._dirty = true;
        this.dirty = true;
    }

    refreshUniforms (): void {
        const gl = this._gl;
        if (this._dirty && this._uniforms) {
            if (this._program) {
                twgl.setUniforms(this._program, this._uniforms);
            }
            this._dirty = false;
        }
    }

    /**
     * Vertex shader source used by all Gandi post-processing passes.
     */
    getVertShaderSrc (): string {
        return GandiGLSLCommon.VERT_SHADER_SRC;
    }

    /**
     * Fragment shader source for this effector.
     * Subclasses override by defining a static `FRAG_SHADER_SRC`.
     */
    getFragShaderSrc (): string {
        const Ctor = this.constructor as any;
        return Ctor.FRAG_SHADER_SRC || '';
    }

    /**
     * True when this effector's shader program compiled successfully.
     */
    get isSupported (): boolean {
        return !!this._program;
    }

    /**
     * Lazily compile (and cache) the shader program for this effector.
     * Returns the compiled program info or null on failure.
     */
    getProgram (): any {
        if (this._program) {
            return this._program;
        }
        const gl = this._gl;
        const vertSrc = this.getVertShaderSrc();
        const fragSrc = this.getFragShaderSrc();
        if (!vertSrc || !fragSrc) {
            this._program = null;
            return null;
        }
        try {
            this._program = twgl.createProgramInfo(gl, [vertSrc, fragSrc]);
        } catch (e) {
            console.error(`GandiShader: failed to build program for "${this.name}"`, e);
            this._program = null;
        }
        return this._program;
    }

    /**
     * Set up the GL state so this effector can draw: bind program, set buffers
     * and attributes, and apply the source texture uniform.
     * @param {object} bufferInfo - Buffer info used for the fullscreen quad.
     * @returns {boolean} True when setup succeeded.
     */
    trySetupProgram (bufferInfo: any = null): boolean {
        const info = this.getProgram();
        if (!info || !info.program) {
            return false;
        }
        const gl = this._gl;
        const bi = bufferInfo || this._bufferInfo;
        if (!bi) {
            return false;
        }
        gl.useProgram(info.program);
        twgl.setBuffersAndAttributes(gl, info, bi);
        this.refreshUniforms();
        return true;
    }

    /**
     * Render this post-processing pass.
     * @returns {boolean} True when a frame was produced and should be re-synced.
     */
    render (): boolean {
        // Not bypassed check: JS effector used `bypass > 0`; here bypass is boolean.
        if (this.bypass || !this.trySetupProgram()) {
            this.dirty = false;
            return false;
        }
        const gl = this._gl;
        const source = this._renderer.fbo ? this._renderer.fbo.attachments[0] : null;
        if (source) {
            twgl.setUniforms(this._program, {
                [GandiShader.POST_INPUT_NAME]: source,
            });
        }
        twgl.drawBufferInfo(gl, this._bufferInfo);
        this.dirty = true;
        return true;
    }

    /**
     * Alias of {@link GandiShader#render} kept for the multi-pass pipeline.
     */
    exec (): boolean {
        return this.render();
    }

    /**
     * @param {object} bufferInfo
     */
    setBufferInfo (bufferInfo: any): void {
        this._bufferInfo = bufferInfo;
    }

    getFrameBufferInfo (width: number, height: number): any {
        const gl = this._gl;
        if (!this._fbo) {
            this._fbo = twgl.createFramebufferInfo(gl, [{
                width,
                height,
                min: gl.LINEAR,
                mag: gl.LINEAR,
                wrap: gl.CLAMP_TO_EDGE
            }]);
        }
        return this._fbo;
    }

    dispose (): void {
        if (this._program) {
            const gl = this._gl;
            gl.deleteProgram(this._program.program);
            this._program = null;
        }
    }
}

export default GandiShader;
