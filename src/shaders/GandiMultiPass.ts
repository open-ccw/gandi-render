/**
 * Manager for executing multiple shader effects as a pipeline.
 * @author LK
 */
class GandiMultiPass {
    _gl: WebGLRenderingContext;
    _shaders: any[];
    _bufferInfo: any;
    _currentFbo: any;
    _bufferIndex: number;
    _width: number;
    _height: number;

    constructor (gl: WebGLRenderingContext, shaders: any[]) {
        this._gl = gl;
        this._shaders = shaders;
        this._currentFbo = null;
        this._bufferIndex = 0;
        this._width = 0;
        this._height = 0;

        this._bufferInfo = null;
    }

    setBufferInfo (bufferInfo: any, width: number, height: number): void {
        this._bufferInfo = bufferInfo;
        this._width = width;
        this._height = height;
    }

    execMultiPassRender (): void {
        const {_gl: gl, _shaders: shaders} = this;
        // Execute each shader in sequence
        for (let i = 0; i < shaders.length; i++) {
            const shader = shaders[i];
            if (shader && shader.exec) {
                shader.exec(gl);
            }
        }
    }

    push (shader: any): void {
        this._shaders.push(shader);
    }

    remove (shader: any): void {
        const index = this._shaders.indexOf(shader);
        if (index > -1) {
            this._shaders.splice(index, 1);
        }
    }

    clear (): void {
        this._shaders.length = 0;
    }

    /**
     * Dispose of all resources.
     */
    dispose (): void {
        this._shaders.length = 0;
        this._bufferInfo = null;
    }
}

export default GandiMultiPass;
