import * as twgl from "twgl.js";

import Skin from "./Skin";
import RenderWebGL from "./RenderWebGL";

class BitmapSkin extends Skin {
  _costumeResolution: number;
  _textureSize: number[];
  /**
   * Create a new Bitmap Skin.
   * @extends Skin
   * @param {!number} id - The ID for this Skin.
   * @param {!RenderWebGL} renderer - The renderer which will use this skin.
   */
  constructor(id: number, renderer: RenderWebGL) {
    super(id);

    /** @type {!number} */
    this._costumeResolution = 1;

    /** @type {!RenderWebGL} */
    this._renderer = renderer;

    /** @type {Array<number>} */
    this._textureSize = [0, 0];
  }

  /**
   * Dispose of this object. Do not use it after calling this method.
   */
  dispose() {
    if (this._texture) {
      this._renderer.gl.deleteTexture(this._texture);
      this._texture = null;
    }
    super.dispose();
  }

  /**
   * @return {Array<number>} the "native" size, in texels, of this skin.
   */
  get size(): Array<number> {
    return [
      this._textureSize[0] / this._costumeResolution,
      this._textureSize[1] / this._costumeResolution,
    ];
  }

  /**
   * @param {Array<number>} scale - The scaling factors to be used.
   * @return {WebGLTexture} The GL texture representation of this skin when drawing at the given scale.
   */
  // eslint-disable-next-line no-unused-vars
  getTexture(scale: Array<number>): WebGLTexture {
    return this._texture || super.getTexture();
  }

  /**
   * Set the contents of this skin to a snapshot of the provided bitmap data.
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} bitmapData - new contents for this skin.
   * @param {number} [costumeResolution=1] - The resolution to use for this bitmap.
   * @param {Array<number>} [rotationCenter] - Optional rotation center for the bitmap. If not supplied, it will be
   * calculated from the bounding box
   * @fires Skin.event:WasAltered
   */
  setBitmap(
    bitmapData:
      | ImageData
      | HTMLImageElement
      | HTMLCanvasElement
      | HTMLVideoElement,
    costumeResolution: number,
    rotationCenter: Array<number>,
  ) {
    if (!bitmapData.width || !bitmapData.height) {
      super.setEmptyImageData();
      return;
    }
    const gl = this._renderer.gl;

    // Preferably bitmapData is ImageData. ImageData speeds up updating
    // Silhouette and is better handled by more browsers in regards to
    // memory.
    let textureData = bitmapData;
    if (bitmapData instanceof HTMLCanvasElement) {
      // Given a HTMLCanvasElement get the image data to pass to webgl and
      // Silhouette.
      const context = bitmapData.getContext("2d")!;
      textureData = context.getImageData(
        0,
        0,
        bitmapData.width,
        bitmapData.height,
      );
    }

    if (this._texture === null) {
      const textureOptions = {
        auto: false,
        wrap: gl.CLAMP_TO_EDGE,
      };

      this._texture = twgl.createTexture(gl, textureOptions);
    }

    this._setTexture(textureData);

    // Do these last in case any of the above throws an exception
    this._costumeResolution = costumeResolution || 2;
    this._textureSize = BitmapSkin._getBitmapSize(bitmapData);

    if (typeof rotationCenter === "undefined")
      rotationCenter = this.calculateRotationCenter();
    this._rotationCenter[0] = rotationCenter[0];
    this._rotationCenter[1] = rotationCenter[1];

    this.emit(Skin.Events.WasAltered);
  }

  /**
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement|HTMLVideoElement} bitmapData - bitmap data to inspect.
   * @returns {Array<number>} the width and height of the bitmap data, in pixels.
   * @private
   */
  static _getBitmapSize(
    bitmapData:
      | ImageData
      | HTMLImageElement
      | HTMLCanvasElement
      | HTMLVideoElement,
  ): Array<number> {
    if (bitmapData instanceof HTMLImageElement) {
      return [
        bitmapData.naturalWidth || bitmapData.width,
        bitmapData.naturalHeight || bitmapData.height,
      ];
    }

    if (bitmapData instanceof HTMLVideoElement) {
      return [
        bitmapData.videoWidth || bitmapData.width,
        bitmapData.videoHeight || bitmapData.height,
      ];
    }

    // ImageData or HTMLCanvasElement
    return [bitmapData.width, bitmapData.height];
  }
}

export default BitmapSkin;
