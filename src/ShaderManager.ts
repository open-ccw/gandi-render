// @ts-ignore
import * as twgl from "twgl.js";
import GandiShaderManager from "./GandiShaderManager";
import GandiGLSLCommon from "./shaders/GandiGLSLCommon";
import spriteVertSrc from "./shaders/sprite.vert?raw";
import spriteFragSrc from "./shaders/sprite.frag?raw";

/**
 * @author LK
 * Manages shader programs for the renderer.
 */
class ShaderManager {
  _gl: WebGLRenderingContext;
  _renderer: any;
  _gandiShaderManager: GandiShaderManager | null;
  _programCache: Record<string, any>;
  _shaderCache: Record<string, any[]>;

  constructor(renderer: any) {
    this._gl = renderer._gl;
    this._renderer = renderer;
    this._gandiShaderManager = null;
    this._programCache = {};
    this._shaderCache = {};
    for (const modeName in ShaderManager.DRAW_MODE) {
      if (
        Object.prototype.hasOwnProperty.call(ShaderManager.DRAW_MODE, modeName)
      ) {
        this._shaderCache[modeName] = [];
      }
    }
  }

  get gandiShaderManager(): GandiShaderManager {
    if (!this._gandiShaderManager) {
      // Lazily create the post-processing manager. When the renderer doesn't
      // provide a dedicated FBO / buffer info yet, fall back to a minimal stub
      // so the effector API (register / execPostProcessingRender / sync) stays
      // available. The renderer normally owns its own instance via
      // `renderer._gandiShaderManager`; this wrapper is provided for parity with
      // the original `GandiShaderManager.js`.
      const gl = this._gl;
      const render =
        this._renderer && this._renderer._gl
          ? this._renderer
          : { _gl: gl, fbo: null };
      const bufferInfo =
        this._renderer && this._renderer._bufferInfo
          ? this._renderer._bufferInfo
          : null;
      this._gandiShaderManager = new GandiShaderManager(gl, bufferInfo, render);
    }
    return this._gandiShaderManager;
  }

  /**
   * Create a shader program from vertex and fragment shader sources.
   * @param vertSrc - Vertex shader source string.
   * @param fragSrc - Fragment shader source string.
   * @returns Program info object.
   */
  createProgram(vertSrc: string, fragSrc: string): any {
    try {
      const programInfo = twgl.createProgramInfo(this._gl, [vertSrc, fragSrc]);
      return programInfo;
    } catch (e) {
      console.error("Failed to create shader program:", e);
      return null;
    }
  }

  /**
   * Get a cached or create a new program.
   * @param key - Cache key for the program.
   * @param vertSrc - Vertex shader source string.
   * @param fragSrc - Fragment shader source string.
   * @returns Program info object.
   */
  getProgram(key: string, vertSrc: string, fragSrc: string): any {
    if (this._programCache[key]) {
      return this._programCache[key];
    }
    const program = this.createProgram(vertSrc, fragSrc);
    if (program) {
      this._programCache[key] = program;
    }
    return program;
  }

  /**
   * Get common vertex shader source.
   * @returns Common vertex shader source string.
   */
  getCommonVertShader(): string {
    return GandiGLSLCommon.VERT_SHADER_SRC;
  }

  /**
   * Fetch the shader for a particular set of active effects, building it if needed.
   * @param drawMode Draw normally, silhouette, etc.
   * @param effectBits Bitmask representing the enabled effects.
   * @returns The shader's program info.
   */
  getShader(drawMode: string, effectBits: number): any {
    const cache = this._shaderCache[drawMode];
    if (drawMode === ShaderManager.DRAW_MODE.silhouette) {
      // Silhouette mode isn't affected by these effects.
      effectBits &= ~(
        ShaderManager.EFFECT_INFO.color.mask |
        ShaderManager.EFFECT_INFO.brightness.mask
      );
    }
    let shader = cache[effectBits];
    if (!shader) {
      shader = cache[effectBits] = this._buildShader(drawMode, effectBits);
    }
    return shader;
  }

  /**
   * Build the shader for a particular set of active effects.
   * @param drawMode Draw normally, silhouette, etc.
   * @param effectBits Bitmask representing the enabled effects.
   * @returns The new shader's program info.
   * @private
   */
  _buildShader(drawMode: string, effectBits: number): any {
    const numEffects = ShaderManager.EFFECTS.length;

    const defines = [`#define DRAW_MODE_${drawMode}`];
    for (let index = 0; index < numEffects; ++index) {
      if ((effectBits & (1 << index)) !== 0) {
        defines.push(`#define ENABLE_${ShaderManager.EFFECTS[index]}`);
      }
    }
    for (const name in ShaderManager.EXTRA_EFFECT_INFO) {
      if ((effectBits & ShaderManager.EXTRA_EFFECT_INFO[name].mask) !== 0) {
        defines.push(`#define ENABLE_${name}`);
      }
    }

    const definesText = `${defines.join("\n")}\n`;

    const vsFullText = definesText + spriteVertSrc;
    const fsFullText = definesText + spriteFragSrc;

    return twgl.createProgramInfo(this._gl, [vsFullText, fsFullText]);
  }

  static EFFECT_INFO: Record<string, Effect> = {
    /** Color effect */
    color: {
      uniformName: "u_color",
      mask: 1 << 0,
      converter: (x) => (x / 200) % 1,
      shapeChanges: false,
    },
    /** Fisheye effect */
    fisheye: {
      uniformName: "u_fisheye",
      mask: 1 << 1,
      converter: (x) => Math.max(0, (x + 100) / 100),
      shapeChanges: true,
    },
    /** Whirl effect */
    whirl: {
      uniformName: "u_whirl",
      mask: 1 << 2,
      converter: (x) => (-x * Math.PI) / 180,
      shapeChanges: true,
    },
    /** Pixelate effect */
    pixelate: {
      uniformName: "u_pixelate",
      mask: 1 << 3,
      converter: (x) => Math.abs(x) / 10,
      shapeChanges: true,
    },
    /** Mosaic effect */
    mosaic: {
      uniformName: "u_mosaic",
      mask: 1 << 4,
      converter: (x) => {
        x = Math.round((Math.abs(x) + 10) / 10);
        /** @todo cap by Math.min(srcWidth, srcHeight) */
        return Math.max(1, Math.min(x, 512));
      },
      shapeChanges: true,
    },
    /** Brightness effect */
    brightness: {
      uniformName: "u_brightness",
      mask: 1 << 5,
      converter: (x) => Math.max(-100, Math.min(x, 100)) / 100,
      shapeChanges: false,
    },
    /** Ghost effect */
    ghost: {
      uniformName: "u_ghost",
      mask: 1 << 6,
      converter: (x) => 1 - Math.max(0, Math.min(x, 100)) / 100,
      shapeChanges: false,
    },
  };

  static EXTRA_EFFECT_INFO = {
    nineSlice: {
      mask: 1 << 11,
      shapeChanges: true,
    },
    gaussianBlur: {
      mask: 1 << 12,
      shapeChanges: false,
    },
    tint: {
      mask: 1 << 13,
      shapeChanges: false,
    },
    tile: {
      mask: 1 << 14,
      shapeChanges: true,
    },
    clipBox: {
      mask: 1 << 15,
      shapeChanges: true,
    },
  };
  static EFFECTS = Object.keys(ShaderManager.EFFECT_INFO);
  static DRAW_MODE = {
    /**
     * Draw normally. Its output will use premultiplied alpha.
     */
    default: "default",

    /**
     * Draw with non-premultiplied alpha. Useful for reading pixels from GL into an ImageData object.
     */
    straightAlpha: "straightAlpha",

    /**
     * Draw a silhouette using a solid color.
     */
    silhouette: "silhouette",

    /**
     * Draw only the parts of the drawable which match a particular color.
     */
    colorMask: "colorMask",

    /**
     * Draw a line with caps.
     */
    line: "line",

    /**
     * Draw the background in a certain color. Must sometimes be used instead of gl.clear.
     */
    background: "background",
  };
}

interface Effect {
  uniformName: string;
  mask: number;
  converter: Function;
  shapeChanges: boolean;
}

export default ShaderManager;
