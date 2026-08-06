import GandiShader from './shaders/GandiShader';
import GandiShaderLoader from './shaders/GandiShaderLoader';
import GandiSync from './shaders/GandiSync';

/**
 * @author LK
 *
 * Manages the Gandi post-processing shader pipeline.
 *
 * This is the TypeScript counterpart of the original `GandiShaderManager.js`.
 * It drives a chain of "effectors" (post-processing passes) registered by name.
 * The renderer calls `execPostProcessingRender()` every frame to run the active
 * passes over the scene rendered to `renderer.fbo`, and `sync()` to copy the
 * final result back to the default framebuffer.
 */
class GandiShaderManager {
    /**
     * Map of lower-case effector name -> effector constructor used by `register`.
     * Keys match the names accepted by the JS-era `GandiShaderManager.register`.
     */
    static EFFECTOR_LIST: Record<string, any> = {
        glitch: GandiShaderLoader.SHADER_LIST.GandiGlitch,
        film: GandiShaderLoader.SHADER_LIST.GandiFilm,
        shadow: GandiShaderLoader.SHADER_LIST.GandiShadow,
        shake: GandiShaderLoader.SHADER_LIST.GandiShake,
        shockwave: GandiShaderLoader.SHADER_LIST.GandiShockWave,
        bloom: GandiShaderLoader.SHADER_LIST.GandiBloom,
        comics: GandiShaderLoader.SHADER_LIST.GandiComics,
    };

    _gl: WebGLRenderingContext;
    _bufferInfo: any;
    _render: any;
    _version: string;
    syncShader: GandiSync;
    effectors: Map<string, GandiShader>;
    postProcessing: GandiShader[];

    constructor (gl: WebGLRenderingContext, bufferInfo: any, render: any) {
        this._version = '1.0.2';
        this._gl = gl;
        this._bufferInfo = bufferInfo;
        this._render = render;
        this.effectors = new Map();
        this.postProcessing = [];

        this.syncShader = new GandiSync(render, bufferInfo);
    }

    get isSupported (): boolean {
        return !!this.syncShader && this.syncShader.isSupported;
    }

    reset (): void {
        this.postProcessing = [];
        this.effectors.clear();
    }

    unregister (name: string): void {
        if (this.effectors.has(name)) {
            const oldEffector = this.effectors.get(name);
            if (oldEffector) {
                oldEffector.bypass = true;
            }
            this.postProcessing = this.postProcessing.filter(pp => pp !== oldEffector);
            this.effectors.delete(name);
        }
    }

    /**
     * Register a post-processing effector.
     * @param {string} name - Effector name, e.g. 'glitch', 'bloom', 'shake'.
     * @param {boolean} [bypass=true] - Start in bypassed state.
     * @returns {GandiShader|null} The created effector, or null when unknown.
     */
    register (name: string, bypass: boolean = true): GandiShader | null {
        const EffectorClass = GandiShaderManager.EFFECTOR_LIST[name];
        if (!EffectorClass) {
            return null;
        }
        const effector: GandiShader = new EffectorClass(this._render, this._bufferInfo);
        effector.name = name;

        this.unregister(name);

        effector.bypass = bypass;
        if (!bypass) {
            effector.dirty = true;
        }
        this.postProcessing.push(effector);
        this.effectors.set(name, effector);
        return effector;
    }

    effector (name: string): GandiShader | undefined {
        return this.effectors.get(name);
    }

    execPostProcessingRender (): boolean {
        let dirty = false;
        for (const effector of this.postProcessing) {
            dirty = effector.render() || dirty;
        }
        return dirty;
    }

    sync (): void {
        if (this.syncShader) {
            this.syncShader.render();
        }
    }
}

export default GandiShaderManager;
