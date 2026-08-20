/* eslint-disable camelcase */
import EventEmitter from "events";

import hull from "@turbowarp/ancient-hull.js";
import * as twgl from "twgl.js";

import BitmapSkin from "./BitmapSkin";
import Drawable from "./Drawable";
import Rectangle from "./Rectangle";
import PenSkin from "./PenSkin";
import RenderConstants from "./RenderConstants";
import ShaderManager from "./ShaderManager";
import SVGSkin from "./SVGSkin";
import Skin from "./Skin";
import TextBubbleSkin from "./TextBubbleSkin";
import EffectTransform from "./EffectTransform";
import log from "./util/log";

import GandiShaderManager from "./GandiShaderManager";
// import GandiMultiPass from './shaders/GandiMultiPass';

import SpineSkin from "./SpineSkin";
import SpineManager from "./SpineManager";

import LayerManager from "./LayerManager";

const __isTouchingDrawablesPoint = twgl.v3.create();
const __candidatesBounds = new Rectangle();
const __fenceBounds = new Rectangle();
const __touchingColor = new Uint8ClampedArray(4);
const __blendColor = new Uint8ClampedArray(4);

// More pixels than this and we give up to the GPU and take the cost of readPixels
// Width * Height * Number of drawables at location
const __cpuTouchingColorPixelCount = 4e4;

/**
 * Maximum touch size for a picking check.
 */
const MAX_TOUCH_SIZE = [3, 3];

/**
 * Passed to the uniforms for mask in touching color
 */
const MASK_TOUCHING_COLOR_TOLERANCE = 2;

/**
 * Maximum number of pixels in either dimension of "extracted drawable" data
 */
const MAX_EXTRACTED_DRAWABLE_DIMENSION = 2048;

/**
 * Determines if the mask color is "close enough" (only test the 6 top bits for
 * each color).  These bit masks are what scratch 2 used to use, so we do the same.
 */
const maskMatches = (
  a: Uint8Array | Uint8ClampedArray,
  b: Uint8Array | Uint8ClampedArray,
): boolean =>
  // has some non-alpha component to test against
  a[3] > 0 &&
  (a[0] & 0b11111100) === (b[0] & 0b11111100) &&
  (a[1] & 0b11111100) === (b[1] & 0b11111100) &&
  (a[2] & 0b11111100) === (b[2] & 0b11111100);

/**
 * Determines if the given color is "close enough" (only test the 5 top bits for
 * red and green, 4 bits for blue).
 */
const colorMatches = (
  a: Uint8Array | Uint8ClampedArray,
  b: Uint8Array | Uint8ClampedArray,
  offset: number,
): boolean =>
  (a[0] & 0b11111000) === (b[offset + 0] & 0b11111000) &&
  (a[1] & 0b11111000) === (b[offset + 1] & 0b11111000) &&
  (a[2] & 0b11110000) === (b[offset + 2] & 0b11110000);

/**
 * Sprite Fencing - The number of pixels a sprite is required to leave remaining
 * onscreen around the edge of the staging area.
 */
const FENCE_WIDTH = 15;

class RenderWebGL extends EventEmitter {
  /** Static enums */
  static UseGpuModes = {
    /** Heuristically decide whether to use the GPU path, the CPU path, or a dynamic mixture of the two. */
    Automatic: "Automatic" as const,
    /** Always use the GPU path. */
    ForceGPU: "ForceGPU" as const,
    /** Always use the CPU path. */
    ForceCPU: "ForceCPU" as const,
  };

  _useGpuMode: string;
  _allDrawables: Drawable[];
  _allSkins: Skin[];
  _drawList: number[];
  _groupOrdering: string[];
  _layerGroups: Record<string, any>;
  _nextDrawableId: number;
  _nextSkinId: number;
  _projection: any;
  _shaderManager: ShaderManager;
  _tempCanvas: HTMLCanvasElement;
  _regionId: any;
  _exitRegion: any;
  _backgroundDrawRegionId: any;
  _snapshotCallbacks: ((dataURI: string) => void)[];
  _backgroundColor4f: number[];
  _backgroundColor3b: Uint8ClampedArray;
  _penSkinId: number | null;
  useHighQualityRender: boolean;
  offscreenTouching: boolean;
  dirty: boolean;
  peDirty: boolean;
  _gandiShaderManager: GandiShaderManager;
  spineManager: SpineManager;
  layerManager: LayerManager;
  fbo: any;
  _bufferInfo: any;
  _queryBufferInfo: any;
  _pickBufferInfo: any;
  _gl: WebGLRenderingContext;
  _xLeft: number;
  _xRight: number;
  _yBottom: number;
  _yTop: number;
  _nativeSize: [number, number];
  _debugCanvas: HTMLCanvasElement | null;
  _frameCall: any;
  exports: any;

  /**
   * Check if this environment appears to support this renderer before attempting to create an instance.
   */
  static isSupported(optCanvas?: HTMLCanvasElement): boolean {
    try {
      optCanvas = optCanvas || document.createElement("canvas");
      const options = { alpha: false, stencil: true, antialias: false };
      const ctx: any = optCanvas.getContext("webgl", options);
      const ctx2: any = optCanvas.getContext("experimental-webgl", options);
      const ctx3: any = optCanvas.getContext("webgl2");
      return !!(ctx || ctx2 || ctx3);
    } catch (e) {
      return false;
    }
  }

  /**
   * Ask TWGL to create a rendering context with the attributes used by this renderer.
   */
  static _getContext(canvas: HTMLCanvasElement): WebGLRenderingContext {
    const contextAttribs = { alpha: false, stencil: true, antialias: false };
    return twgl.getContext(canvas, contextAttribs);
  }

  /**
   * Sample a "final" color from an array of drawables at a given scratch space.
   */
  static sampleColor3b(
    vec: any,
    drawables: any[],
    dst?: Uint8ClampedArray,
  ): Uint8ClampedArray {
    dst = dst || new Uint8ClampedArray(3);
    dst.fill(0);
    let blendAlpha = 1;
    for (let index = 0; blendAlpha !== 0 && index < drawables.length; index++) {
      Drawable.sampleColor4b(vec, drawables[index].drawable, __blendColor);
      dst[0] += __blendColor[0] * blendAlpha;
      dst[1] += __blendColor[1] * blendAlpha;
      dst[2] += __blendColor[2] * blendAlpha;
      blendAlpha *= 1 - __blendColor[3] / 255;
    }
    dst[0] += blendAlpha * 255;
    dst[1] += blendAlpha * 255;
    dst[2] += blendAlpha * 255;
    return dst;
  }

  /**
   * Create a renderer for drawing Scratch sprites to a canvas using WebGL.
   */
  constructor(
    canvas: HTMLCanvasElement,
    xLeft?: number,
    xRight?: number,
    yBottom?: number,
    yTop?: number,
  ) {
    super();

    const gl: WebGLRenderingContext = (this._gl =
      RenderWebGL._getContext(canvas));
    if (!gl) {
      throw new Error(
        "Could not get WebGL context: this browser or environment may not support WebGL.",
      );
    }

    this._useGpuMode = RenderWebGL.UseGpuModes.Automatic;
    this._allDrawables = [];
    this._allSkins = [];
    this._drawList = [];
    this._groupOrdering = [];
    this._layerGroups = {};
    this._nextDrawableId = RenderConstants.ID_NONE + 1;
    this._nextSkinId = RenderConstants.ID_NONE + 1;
    this._projection = twgl.m4.identity();
    this._shaderManager = new ShaderManager(this);
    this._tempCanvas = document.createElement("canvas");
    this._regionId = null;
    this._exitRegion = null;
    this._backgroundDrawRegionId = {
      enter: () => this._enterDrawBackground(),
      exit: () => this._exitDrawBackground(),
    };
    this._snapshotCallbacks = [];
    this._backgroundColor4f = [0, 0, 0, 1];
    this._backgroundColor3b = new Uint8ClampedArray(3);
    this._penSkinId = null;
    this.useHighQualityRender = false;
    this.offscreenTouching = false;
    this.dirty = true;
    this.peDirty = true;

    this._createGeometry();

    // init GandiShaderManager
    this._gandiShaderManager = new GandiShaderManager(
      gl,
      this._bufferInfo,
      this,
    );
    this.spineManager = new SpineManager(this, this._gl);
    this.layerManager = new LayerManager(this);

    this.on(RenderConstants.Events.NativeSizeChanged, this.onNativeSizeChanged);

    this.setBackgroundColor(1, 1, 1);
    this.setStageSize(
      xLeft || -240,
      xRight || 240,
      yBottom || -180,
      yTop || 180,
    );

    this.resize(this._nativeSize[0], this._nativeSize[1]);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.exports = {
      twgl,
      Drawable,
      Skin,
      BitmapSkin,
      TextBubbleSkin,
      PenSkin,
      SVGSkin,
      Rectangle,
    };
  }

  resetBuiltinManager(): void {
    this._gandiShaderManager = new GandiShaderManager(
      this._gl,
      this._bufferInfo,
      this,
    );
    this.spineManager = new SpineManager(this, this._gl);
    this.layerManager = new LayerManager(this);
  }

  _createFBO(gl: WebGLRenderingContext, width: number, height: number): void {
    if (this.fbo) {
      gl.deleteFramebuffer(this.fbo.framebuffer);
      this.fbo = null;
    }
    this.fbo = twgl.createFramebufferInfo(gl, [
      {
        width,
        height,
        min: gl.LINEAR,
        mag: gl.LINEAR,
        wrap: gl.CLAMP_TO_EDGE,
      },
    ]);
  }

  initSpineManager(assetHost: string): void {
    this.spineManager.assetManager.pathPrefix = assetHost;
  }

  getSkinClass(): typeof Skin {
    return Skin;
  }

  getSkin(skinId: number): Skin {
    return this._allSkins[skinId];
  }

  setUseHighQualityRender(enabled: boolean): void {
    this.dirty = true;
    this.useHighQualityRender = enabled;
    this.emit(RenderConstants.Events.UseHighQualityRenderChanged, enabled);
    this._updateRenderQuality();
  }

  _updateRenderQuality(): void {
    if (this._penSkinId !== null) {
      const skin = this._allSkins[this._penSkinId];
      if (skin) {
        if (this.useHighQualityRender) {
          skin.setRenderQuality(this.canvas.width / this._nativeSize[0]);
        } else {
          skin.setRenderQuality(1);
        }
      }
    }
    for (const drawable of this._allDrawables) {
      if (drawable) {
        drawable.setHighQuality(this.useHighQualityRender);
      }
    }
  }

  get gl(): WebGLRenderingContext {
    return this._gl;
  }

  get canvas(): HTMLCanvasElement | OffscreenCanvas {
    return this._gl && this._gl.canvas;
  }

  resize(pixelsWide: number, pixelsTall: number): void {
    this.dirty = true;
    const { canvas } = this._gl;
    const pixelRatio = window.devicePixelRatio || 1;
    const newWidth = pixelsWide * pixelRatio;
    const newHeight = pixelsTall * pixelRatio;

    if (canvas.width !== newWidth || canvas.height !== newHeight) {
      canvas.width = newWidth;
      canvas.height = newHeight;
      this._createFBO(this._gl, newWidth, newHeight);
      this.draw();

      this._updateRenderQuality();
    }
  }

  setBackgroundColor(red: number, green: number, blue: number): void {
    this._backgroundColor4f[0] = red;
    this._backgroundColor4f[1] = green;
    this._backgroundColor4f[2] = blue;

    this._backgroundColor3b[0] = red * 255;
    this._backgroundColor3b[1] = green * 255;
    this._backgroundColor3b[2] = blue * 255;
  }

  setDebugCanvas(canvas: HTMLCanvasElement): void {
    this._debugCanvas = canvas;
  }

  setUseGpuMode(useGpuMode: string): void {
    this._useGpuMode = useGpuMode;
  }

  setStageSize(
    xLeft: number,
    xRight: number,
    yBottom: number,
    yTop: number,
  ): void {
    this._xLeft = xLeft;
    this._xRight = xRight;
    this._yBottom = yBottom;
    this._yTop = yTop;

    this._projection = twgl.m4.ortho(xLeft, xRight, yBottom, yTop, -1, 1);

    this._setNativeSize(Math.abs(xRight - xLeft), Math.abs(yBottom - yTop));
  }

  getNativeSize(): [number, number] {
    return [this._nativeSize[0], this._nativeSize[1]];
  }

  _setNativeSize(width: number, height: number): void {
    this._nativeSize = [width, height];
    this.emit(RenderConstants.Events.NativeSizeChanged, {
      newSize: this._nativeSize,
    });
  }

  createBitmapSkin(
    bitmapData: any,
    costumeResolution?: number,
    rotationCenter?: number[],
  ): number {
    const skinId = this._nextSkinId++;
    const newSkin = new BitmapSkin(skinId, this);
    newSkin.setBitmap(bitmapData, costumeResolution, rotationCenter);
    this._allSkins[skinId] = newSkin;
    return skinId;
  }

  createSVGSkin(svgData: string, rotationCenter?: number[]): number {
    const skinId = this._nextSkinId++;
    const newSkin = new SVGSkin(skinId, this);
    newSkin.setSVG(svgData, rotationCenter);
    this._allSkins[skinId] = newSkin;
    return skinId;
  }

  createPenSkin(): number {
    const skinId = this._nextSkinId++;
    const newSkin = new PenSkin(skinId, this);
    this._allSkins[skinId] = newSkin;
    this._penSkinId = skinId;
    this._updateRenderQuality();
    return skinId;
  }

  createTextSkin(type: string, text: string, pointsLeft: boolean): number {
    const skinId = this._nextSkinId++;
    const newSkin = new TextBubbleSkin(skinId, this);
    newSkin.setTextBubble(type, text, pointsLeft);
    this._allSkins[skinId] = newSkin;
    return skinId;
  }

  createSpineSkin(): [number, SpineSkin] | void {
    if (!this.spineManager) {
      console.warn("No spine manager to render");
      return;
    }
    const skinId = this._nextSkinId++;
    const newSkin = new SpineSkin(skinId, this.spineManager);
    this._allSkins[skinId] = newSkin;
    return [skinId, newSkin];
  }

  updateSpineSkin(
    skinId: number,
    atlasDataKey: string,
    animationName: string,
    loop: boolean,
    skeletonJSON: string,
    costumeResolution?: number,
    rotationCenter?: number[],
  ): void {
    if (!this.spineManager) {
      console.warn("No spine manager to render");
      return;
    }
    if (this._allSkins[skinId] instanceof SpineSkin) {
      this._allSkins[skinId].setSkeleton(
        atlasDataKey,
        animationName,
        loop,
        skeletonJSON,
      );
      return;
    }
    const newSkin = new SpineSkin(skinId, this.spineManager);
    newSkin.setSkeleton(atlasDataKey, animationName, loop, skeletonJSON);
    this._reskin(skinId, newSkin);
  }

  updateSVGSkin(
    skinId: number,
    svgData: string,
    rotationCenter?: number[],
  ): void {
    if (this._allSkins[skinId] instanceof SVGSkin) {
      this._allSkins[skinId].setSVG(svgData, rotationCenter);
      return;
    }

    const newSkin = new SVGSkin(skinId, this);
    newSkin.setSVG(svgData, rotationCenter);
    this._reskin(skinId, newSkin);
  }

  updateBitmapSkin(
    skinId: number,
    imgData: any,
    bitmapResolution: number,
    rotationCenter?: number[],
  ): void {
    if (this._allSkins[skinId] instanceof BitmapSkin) {
      this._allSkins[skinId].setBitmap(
        imgData,
        bitmapResolution,
        rotationCenter,
      );
      return;
    }

    const newSkin = new BitmapSkin(skinId, this);
    newSkin.setBitmap(imgData, bitmapResolution, rotationCenter);
    this._reskin(skinId, newSkin);
  }

  _reskin(skinId: number, newSkin: Skin): void {
    const oldSkin = this._allSkins[skinId];
    this._allSkins[skinId] = newSkin;

    for (const drawable of this._allDrawables) {
      if (drawable && drawable.skin === oldSkin) {
        drawable.skin = newSkin;
      }
    }
    oldSkin.dispose();
  }

  updateTextSkin(
    skinId: number,
    type: string,
    text: string,
    pointsLeft: boolean,
  ): void {
    if (this._allSkins[skinId] instanceof TextBubbleSkin) {
      this._allSkins[skinId].setTextBubble(type, text, pointsLeft);
      return;
    }

    const newSkin = new TextBubbleSkin(skinId, this);
    newSkin.setTextBubble(type, text, pointsLeft);
    this._reskin(skinId, newSkin);
  }

  destroySkin(skinId: number): void {
    const oldSkin = this._allSkins[skinId];
    oldSkin.dispose();
    delete this._allSkins[skinId];
  }

  createDrawable(group: string): number | void {
    if (
      !group ||
      !Object.prototype.hasOwnProperty.call(this._layerGroups, group)
    ) {
      log.warn("Cannot create a drawable without a known layer group");
      return;
    }
    const drawableID = this._nextDrawableId++;
    const drawable = new Drawable(drawableID, this);
    this._allDrawables[drawableID] = drawable;
    this._addToDrawList(drawableID, group);
    drawable.setHighQuality(this.useHighQualityRender);

    drawable.skin = null;

    return drawableID;
  }

  setLayerGroupOrdering(groupOrdering: string[]): void {
    this._groupOrdering = groupOrdering;
    for (let i = 0; i < this._groupOrdering.length; i++) {
      this._layerGroups[this._groupOrdering[i]] = {
        groupIndex: i,
        drawListOffset: 0,
      };
    }
  }

  _addToDrawList(drawableID: number, group: string): void {
    const currentLayerGroup = this._layerGroups[group];
    const currentGroupOrderingIndex = currentLayerGroup.groupIndex;

    const drawListOffset = this._endIndexForKnownLayerGroup(currentLayerGroup);
    this._drawList.splice(drawListOffset, 0, drawableID);

    if (group === "sprite") {
      this.layerManager.defaultFolderDrawableAddTo.add(drawableID);
    }

    this._updateOffsets("add", currentGroupOrderingIndex);
  }

  _updateOffsets(updateType: string, currentGroupOrderingIndex: number): void {
    for (
      let i = currentGroupOrderingIndex + 1;
      i < this._groupOrdering.length;
      i++
    ) {
      const laterGroupName = this._groupOrdering[i];
      if (updateType === "add") {
        this._layerGroups[laterGroupName].drawListOffset++;
      } else if (updateType === "delete") {
        this._layerGroups[laterGroupName].drawListOffset--;
      }
    }
  }

  get _visibleDrawList(): number[] {
    return this._drawList.filter((id) => this._allDrawables[id]._visible);
  }

  _endIndexForKnownLayerGroup(layerGroup: any): number {
    const groupIndex = layerGroup.groupIndex;
    if (groupIndex === this._groupOrdering.length - 1) {
      return this._drawList.length;
    }
    return this._layerGroups[this._groupOrdering[groupIndex + 1]]
      .drawListOffset;
  }

  destroyDrawable(drawableID: number, group: string): void {
    if (
      !group ||
      !Object.prototype.hasOwnProperty.call(this._layerGroups, group)
    ) {
      log.warn("Cannot destroy drawable without known layer group.");
      return;
    }
    this.dirty = true;
    const drawable = this._allDrawables[drawableID];
    drawable.dispose();
    delete this._allDrawables[drawableID];

    const currentLayerGroup = this._layerGroups[group];
    const endIndex = this._endIndexForKnownLayerGroup(currentLayerGroup);

    let index = currentLayerGroup.drawListOffset;
    while (index < endIndex) {
      if (this._drawList[index] === drawableID) {
        break;
      }
      index++;
    }
    if (index < endIndex) {
      this._drawList.splice(index, 1);
      this._updateOffsets("delete", currentLayerGroup.groupIndex);
    } else {
      log.warn(
        "Could not destroy drawable that could not be found in layer group.",
      );
      return;
    }
  }

  getDrawableOrder(drawableID: number): number {
    return this._drawList.indexOf(drawableID);
  }

  setDrawableOrder(
    drawableID: number,
    order: number,
    group?: string,
    optIsRelative?: boolean,
    optMin?: number,
  ): number | null | void {
    if (
      !group ||
      !Object.prototype.hasOwnProperty.call(this._layerGroups, group)
    ) {
      log.warn(
        "Cannot set the order of a drawable without a known layer group.",
      );
      return;
    }

    this.dirty = true;
    if (this.layerManager.layerSortingEnabled && group === "sprite") {
      const folder = this.getDrawableLayerFolder(drawableID);
      if (folder) {
        const ascending = this.layerManager.order;
        folder.changeDrawableOrder(drawableID, ascending, order, optIsRelative);
      }
    } else {
      const currentLayerGroup = this._layerGroups[group];
      const startIndex = currentLayerGroup.drawListOffset;
      const endIndex = this._endIndexForKnownLayerGroup(currentLayerGroup);

      let oldIndex = startIndex;
      while (oldIndex < endIndex) {
        if (this._drawList[oldIndex] === drawableID) {
          break;
        }
        oldIndex++;
      }

      if (oldIndex < endIndex) {
        if (order === 0) {
          return oldIndex;
        }

        this._drawList.splice(oldIndex, 1)[0];
        let newIndex = order;
        if (optIsRelative) {
          newIndex += oldIndex;
        }

        const possibleMin = (optMin || 0) + startIndex;
        const min =
          possibleMin >= startIndex && possibleMin < endIndex
            ? possibleMin
            : startIndex;
        newIndex = Math.max(newIndex, min);

        newIndex = Math.min(newIndex, endIndex);

        this._drawList.splice(newIndex, 0, drawableID);
        return newIndex;
      }
    }
    return null;
  }

  getDrawableLayerIndex(drawableID: number): number {
    const drawable = this._allDrawables[drawableID];
    return drawable._layerIndex;
  }

  setDrawableLayerIndex(drawableID: number, idx: number): void {
    const drawable = this._allDrawables[drawableID];
    if (drawable._layerIndex !== idx) {
      drawable._layerIndex = idx;
      if (drawable._layerFolder) drawable._layerFolder.setOrderDirty(true);
    }
  }

  getDrawableLayerFolder(drawableID: number): any {
    const drawable = this._allDrawables[drawableID];
    return drawable._layerFolder;
  }

  setDrawableLayerFolder(drawableID: number, folder: any): void {
    const drawable = this._allDrawables[drawableID];
    drawable._layerFolder = folder;
  }

  draw(): void {
    if (!this.dirty && !this.peDirty && !this.layerManager.needResort) {
      return;
    }
    if (this.layerManager.layerSortingEnabled) {
      const spriteLayerGroup = this._layerGroups.sprite;
      if (spriteLayerGroup) {
        const startIndex = Math.max(spriteLayerGroup.drawListOffset, 1);
        const endIndex = this._endIndexForKnownLayerGroup(spriteLayerGroup);

        this._drawList = this.layerManager.getSortedDrawListAndUpdateSeparators(
          this._drawList,
          startIndex,
          endIndex,
        );
      }
    } else {
      this.layerManager.refreshShaderSeparators(this._drawList);
    }
    const unshadedIdx = this.layerManager.shaderSeparators[0][2];

    const gl = this._gl;
    if (this._gandiShaderManager.isSupported) {
      if (this.dirty) {
        this.peDirty = true;
        this._doExitDrawRegion();

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.framebuffer);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clearColor(
          ...(this._backgroundColor4f as [number, number, number, number]),
        );
        gl.clear(gl.COLOR_BUFFER_BIT);

        this._drawThese(
          this._drawList,
          ShaderManager.DRAW_MODE.default,
          this._projection,
          {
            framebufferWidth: gl.canvas.width,
            framebufferHeight: gl.canvas.height,
            endIndex: unshadedIdx,
          },
        );
      }

      twgl.bindFramebufferInfo(gl, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clearColor(
        ...(this._backgroundColor4f as [number, number, number, number]),
      );
      gl.clear(gl.COLOR_BUFFER_BIT);

      this._gandiShaderManager.sync();

      const peDirty = this.peDirty;
      if (this.peDirty) {
        this.peDirty = this._gandiShaderManager.execPostProcessingRender();
      }

      if (this.dirty || peDirty) {
        this.dirty = false;

        this._drawThese(
          this._drawList,
          ShaderManager.DRAW_MODE.default,
          this._projection,
          {
            framebufferWidth: gl.canvas.width,
            framebufferHeight: gl.canvas.height,
            startIndex: unshadedIdx,
          },
        );
      }
    } else {
      this.dirty = false;
      this.peDirty = false;
      this._doExitDrawRegion();
      twgl.bindFramebufferInfo(gl, null);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.clearColor(
        ...(this._backgroundColor4f as [number, number, number, number]),
      );
      gl.clear(gl.COLOR_BUFFER_BIT);

      this._drawThese(
        this._drawList,
        ShaderManager.DRAW_MODE.default,
        this._projection,
        {
          framebufferWidth: gl.canvas.width,
          framebufferHeight: gl.canvas.height,
        },
      );
    }

    this.emit("CanvasRenderReady", gl.canvas);
    if (this._snapshotCallbacks.length > 0) {
      const snapshot = (gl.canvas as HTMLCanvasElement).toDataURL();
      this._snapshotCallbacks.forEach((cb) => cb(snapshot));
      this._snapshotCallbacks = [];
    }
  }

  getBounds(drawableID: number): any {
    const drawable = this._allDrawables[drawableID];
    if (drawable.needsConvexHullPoints()) {
      const points = this._getConvexHullPointsForDrawable(drawableID);
      drawable.setConvexHullPoints(points);
    }
    const bounds = drawable.getFastBounds(null);
    if (this._debugCanvas) {
      const gl = this._gl;
      this._debugCanvas.width = gl.canvas.width;
      this._debugCanvas.height = gl.canvas.height;
      const context = this._debugCanvas.getContext("2d")!;
      context.drawImage(gl.canvas, 0, 0);
      context.strokeStyle = "#FF0000";
      const pr = window.devicePixelRatio;
      context.strokeRect(
        pr * (bounds.left + this._nativeSize[0] / 2),
        pr * (-bounds.top + this._nativeSize[1] / 2),
        pr * (bounds.right - bounds.left),
        pr * (-bounds.bottom + bounds.top),
      );
    }
    return bounds;
  }

  getBoundsForBubble(drawableID: number): any {
    const drawable = this._allDrawables[drawableID];
    if (drawable.needsConvexHullPoints()) {
      const points = this._getConvexHullPointsForDrawable(drawableID);
      drawable.setConvexHullPoints(points);
    }
    const bounds = drawable.getBoundsForBubble(null);
    if (this._debugCanvas) {
      const gl = this._gl;
      this._debugCanvas.width = gl.canvas.width;
      this._debugCanvas.height = gl.canvas.height;
      const context = this._debugCanvas.getContext("2d")!;
      context.drawImage(gl.canvas, 0, 0);
      context.strokeStyle = "#FF0000";
      const pr = window.devicePixelRatio;
      context.strokeRect(
        pr * (bounds.left + this._nativeSize[0] / 2),
        pr * (-bounds.top + this._nativeSize[1] / 2),
        pr * (bounds.right - bounds.left),
        pr * (-bounds.bottom + bounds.top),
      );
    }
    return bounds;
  }

  getCurrentSkinSize(drawableID: number): [number, number] {
    const drawable = this._allDrawables[drawableID];
    return this.getSkinSize(drawable.skin.id);
  }

  getSkinSize(skinID: number): [number, number] {
    const skin = this._allSkins[skinID];
    const size = skin.size;
    return [size[0], size[1]];
  }

  getSkinRotationCenter(skinID: number): [number, number] {
    const skin = this._allSkins[skinID];
    const center = skin.calculateRotationCenter();
    return [center[0], center[1]];
  }

  isTouchingColor(
    drawableID: number,
    color3b: number[],
    mask3b?: number[],
  ): boolean {
    const candidates = this._candidatesTouching(
      drawableID,
      this._visibleDrawList,
    );

    let bounds: any;
    if (
      colorMatches(
        new Uint8Array(color3b),
        new Uint8Array(this._backgroundColor3b.buffer),
        0,
      )
    ) {
      bounds = this._touchingBounds(drawableID);
      if (bounds === null) return false;
    } else if (candidates.length === 0) {
      return false;
    } else {
      bounds = this._candidatesBounds(candidates);
    }

    const maxPixelsForCPU = this._getMaxPixelsForCPU();

    const debugCanvasContext =
      this._debugCanvas && this._debugCanvas.getContext("2d");
    if (debugCanvasContext) {
      this._debugCanvas.width = bounds.width;
      this._debugCanvas.height = bounds.height;
    }

    if (
      bounds.width * bounds.height * (candidates.length + 1) >=
      maxPixelsForCPU
    ) {
      this._isTouchingColorGpuStart(
        drawableID,
        candidates.map(({ id }: any) => id).reverse(),
        bounds,
        color3b,
        mask3b,
      );
    }

    const drawable = this._allDrawables[drawableID];
    const point = __isTouchingDrawablesPoint;
    const color = __touchingColor;
    const hasMask = Boolean(mask3b);

    drawable.updateCPURenderAttributes();

    const effectMask = ~ShaderManager.EFFECT_INFO.ghost.mask;

    for (let y = bounds.bottom; y <= bounds.top; y++) {
      if (
        bounds.width * (y - bounds.bottom) * (candidates.length + 1) >=
        maxPixelsForCPU
      ) {
        return this._isTouchingColorGpuFin(bounds, color3b, y - bounds.bottom);
      }
      for (let x = bounds.left; x <= bounds.right; x++) {
        point[1] = y;
        point[0] = x;
        if (
          hasMask
            ? maskMatches(
                Drawable.sampleColor4b(point, drawable, color, effectMask),
                new Uint8Array(mask3b!),
              )
            : drawable.isTouching(point)
        ) {
          RenderWebGL.sampleColor3b(point, candidates, color);
          if (debugCanvasContext) {
            debugCanvasContext.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
            debugCanvasContext.fillRect(
              x - bounds.left,
              bounds.bottom - y,
              1,
              1,
            );
          }
          if (colorMatches(new Uint8Array(color3b), color, 0)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  _getMaxPixelsForCPU(): number {
    switch (this._useGpuMode) {
      case RenderWebGL.UseGpuModes.ForceCPU:
        return Infinity;
      case RenderWebGL.UseGpuModes.ForceGPU:
        return 0;
      case RenderWebGL.UseGpuModes.Automatic:
      default:
        return __cpuTouchingColorPixelCount;
    }
  }

  _enterDrawBackground(): void {
    const gl = this.gl;
    const currentShader = this._shaderManager.getShader(
      ShaderManager.DRAW_MODE.background,
      0,
    );
    gl.disable(gl.BLEND);
    gl.useProgram(currentShader.program);
    twgl.setBuffersAndAttributes(gl, currentShader, this._bufferInfo);
  }

  _exitDrawBackground(): void {
    const gl = this.gl;
    gl.enable(gl.BLEND);
  }

  _isTouchingColorGpuStart(
    drawableID: number,
    candidateIDs: number[],
    bounds: any,
    color3b: number[],
    mask3b?: number[],
  ): void {
    this._doExitDrawRegion();

    const gl = this._gl;
    twgl.bindFramebufferInfo(gl, this._queryBufferInfo);

    gl.viewport(0, 0, bounds.width, bounds.height);
    const projection = twgl.m4.ortho(
      bounds.left,
      bounds.right,
      bounds.top,
      bounds.bottom,
      -1,
      1,
    );

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    let extraUniforms: any;
    if (mask3b) {
      extraUniforms = {
        u_colorMask: [mask3b[0] / 255, mask3b[1] / 255, mask3b[2] / 255],
        u_colorMaskTolerance: MASK_TOUCHING_COLOR_TOLERANCE / 255,
      };
    }

    try {
      gl.enable(gl.STENCIL_TEST);
      gl.stencilFunc(gl.ALWAYS, 1, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
      gl.colorMask(false, false, false, false);
      this._drawThese(
        [drawableID],
        mask3b
          ? ShaderManager.DRAW_MODE.colorMask
          : ShaderManager.DRAW_MODE.silhouette,
        projection,
        {
          extraUniforms,
          ignoreVisibility: true,
          effectMask: ~ShaderManager.EFFECT_INFO.ghost.mask,
        },
      );

      gl.stencilFunc(gl.EQUAL, 1, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.colorMask(true, true, true, true);

      this.enterDrawRegion(this._backgroundDrawRegionId);

      const uniforms = {
        u_backgroundColor: this._backgroundColor4f,
      };

      const currentShader = this._shaderManager.getShader(
        ShaderManager.DRAW_MODE.background,
        0,
      );
      twgl.setUniforms(currentShader, uniforms);
      twgl.drawBufferInfo(gl, this._bufferInfo, gl.TRIANGLES);

      this._drawThese(
        candidateIDs,
        ShaderManager.DRAW_MODE.default,
        projection,
        { idFilterFunc: (testID: number) => testID !== drawableID },
      );
    } finally {
      gl.colorMask(true, true, true, true);
      gl.disable(gl.STENCIL_TEST);
      this._doExitDrawRegion();
    }
  }

  _isTouchingColorGpuFin(
    bounds: any,
    color3b: number[],
    stop: number,
  ): boolean {
    const gl = this._gl;
    const pixels = new Uint8Array(
      Math.floor(bounds.width * (bounds.height - stop) * 4),
    );
    gl.readPixels(
      0,
      0,
      bounds.width,
      bounds.height - stop,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );

    if (this._debugCanvas) {
      this._debugCanvas.width = bounds.width;
      this._debugCanvas.height = bounds.height;
      const context = this._debugCanvas.getContext("2d")!;
      const imageData = context.getImageData(
        0,
        0,
        bounds.width,
        bounds.height - stop,
      );
      imageData.data.set(pixels);
      context.putImageData(imageData, 0, 0);
    }

    for (let pixelBase = 0; pixelBase < pixels.length; pixelBase += 4) {
      if (
        pixels[pixelBase + 3] !== 0 &&
        colorMatches(new Uint8Array(color3b), pixels, pixelBase)
      ) {
        return true;
      }
    }

    return false;
  }

  isTouchingDrawables(
    drawableID: number,
    candidateIDs: number[] | null = this._drawList,
  ): boolean {
    candidateIDs = candidateIDs || this._drawList;
    const candidates = this._candidatesTouching(
      drawableID,
      candidateIDs.filter((id) => this._allDrawables[id]._visible),
    );
    if (candidates.length === 0 || !this._allDrawables[drawableID]._visible) {
      return false;
    }

    const bounds = this._candidatesBounds(candidates);

    const drawable = this._allDrawables[drawableID];
    const point = __isTouchingDrawablesPoint;

    drawable.updateCPURenderAttributes();

    for (let x = bounds.left; x <= bounds.right; x++) {
      point[0] = x;
      for (let y = bounds.bottom; y <= bounds.top; y++) {
        point[1] = y;
        if (drawable.isTouching(point)) {
          for (let index = 0; index < candidates.length; index++) {
            if (candidates[index].drawable.isTouching(point)) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  clientSpaceToScratchBounds(
    centerX: number,
    centerY: number,
    width: number = 1,
    height: number = 1,
  ): Rectangle {
    const gl = this._gl;

    const clientToScratchX =
      this._nativeSize[0] / (gl.canvas as HTMLCanvasElement).clientWidth;
    const clientToScratchY =
      this._nativeSize[1] / (gl.canvas as HTMLCanvasElement).clientHeight;

    width *= clientToScratchX;
    height *= clientToScratchY;

    width = Math.max(1, Math.min(Math.round(width), MAX_TOUCH_SIZE[0]));
    height = Math.max(1, Math.min(Math.round(height), MAX_TOUCH_SIZE[1]));
    const x = centerX * clientToScratchX - (width - 1) / 2;
    const y = centerY * clientToScratchY + (height - 1) / 2;

    const xOfs = width % 2 ? 0 : -0.5;
    const yOfs = height % 2 ? 0 : -0.5;

    const bounds = new Rectangle();
    bounds.initFromBounds(
      Math.floor(this._xLeft + x + xOfs),
      Math.floor(this._xLeft + x + xOfs + width - 1),
      Math.ceil(this._yTop - y + yOfs),
      Math.ceil(this._yTop - y + yOfs + height - 1),
    );
    return bounds;
  }

  drawableTouching(
    drawableID: number,
    centerX: number,
    centerY: number,
    touchWidth?: number,
    touchHeight?: number,
  ): boolean {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) {
      return false;
    }
    const bounds = this.clientSpaceToScratchBounds(
      centerX,
      centerY,
      touchWidth,
      touchHeight,
    );
    const worldPos = twgl.v3.create();

    drawable.updateCPURenderAttributes();

    for (
      worldPos[1] = bounds.bottom;
      worldPos[1] <= bounds.top;
      worldPos[1]++
    ) {
      for (
        worldPos[0] = bounds.left;
        worldPos[0] <= bounds.right;
        worldPos[0]++
      ) {
        if (drawable.isTouching(worldPos)) {
          return true;
        }
      }
    }
    return false;
  }

  pick(
    centerX: number,
    centerY: number,
    touchWidth?: number,
    touchHeight?: number,
    candidateIDs?: number[],
  ): number | false {
    const bounds = this.clientSpaceToScratchBounds(
      centerX,
      centerY,
      touchWidth,
      touchHeight,
    );
    if (bounds.left === -Infinity || bounds.bottom === -Infinity) {
      return false;
    }

    candidateIDs = (candidateIDs || this._drawList).filter((id) => {
      const drawable = this._allDrawables[id];
      if (drawable.getVisible() && drawable.getUniforms().u_ghost !== 0) {
        const drawableBounds = drawable.getFastBounds(null);
        const inRange = bounds.intersects(drawableBounds);
        if (!inRange) return false;
        if (drawable.skin instanceof PenSkin) return false;

        drawable.updateCPURenderAttributes();
        return true;
      }
      return false;
    });
    if (candidateIDs.length === 0) {
      return false;
    }

    const hits: Record<number, number> = {};
    const worldPos = twgl.v3.create(0, 0, 0);
    for (
      worldPos[1] = bounds.bottom;
      worldPos[1] <= bounds.top;
      worldPos[1]++
    ) {
      for (
        worldPos[0] = bounds.left;
        worldPos[0] <= bounds.right;
        worldPos[0]++
      ) {
        for (let d = candidateIDs.length - 1; d >= 0; d--) {
          const id = candidateIDs[d];
          const drawable = this._allDrawables[id];
          if (drawable.isTouching(worldPos)) {
            hits[id] = (hits[id] || 0) + 1;
            break;
          }
        }
      }
    }

    hits[RenderConstants.ID_NONE] = 0;

    let hit: number = RenderConstants.ID_NONE;
    for (const hitID in hits) {
      if (
        Object.prototype.hasOwnProperty.call(hits, hitID) &&
        hits[hitID] > hits[hit]
      ) {
        hit = Number(hitID);
      }
    }

    return hit;
  }

  extractDrawableScreenSpace(drawableID: number): any {
    const drawable = this._allDrawables[drawableID];
    if (!drawable)
      throw new Error(
        `Could not extract drawable with ID ${drawableID}; it does not exist`,
      );

    this._doExitDrawRegion();

    const nativeCenterX = this._nativeSize[0] * 0.5;
    const nativeCenterY = this._nativeSize[1] * 0.5;

    const scratchBounds = drawable.getFastBounds(null);

    const canvas = this.canvas;
    const scaleFactor = canvas.width / this._nativeSize[0];

    const canvasSpaceBounds = new Rectangle();
    canvasSpaceBounds.initFromBounds(
      (scratchBounds.left + nativeCenterX) * scaleFactor,
      (scratchBounds.right + nativeCenterX) * scaleFactor,
      (nativeCenterY - scratchBounds.top) * scaleFactor,
      (nativeCenterY - scratchBounds.bottom) * scaleFactor,
    );
    canvasSpaceBounds.snapToInt();

    scratchBounds.initFromBounds(
      canvasSpaceBounds.left / scaleFactor - nativeCenterX,
      canvasSpaceBounds.right / scaleFactor - nativeCenterX,
      nativeCenterY - canvasSpaceBounds.top / scaleFactor,
      nativeCenterY - canvasSpaceBounds.bottom / scaleFactor,
    );

    const gl = this._gl;

    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const clampedWidth = Math.min(
      MAX_EXTRACTED_DRAWABLE_DIMENSION,
      canvasSpaceBounds.width,
      maxTextureSize,
    );
    const clampedHeight = Math.min(
      MAX_EXTRACTED_DRAWABLE_DIMENSION,
      canvasSpaceBounds.height,
      maxTextureSize,
    );

    const bufferInfo = twgl.createFramebufferInfo(
      gl,
      [{ format: gl.RGBA }],
      clampedWidth,
      clampedHeight,
    );

    try {
      twgl.bindFramebufferInfo(gl, bufferInfo);

      gl.viewport(0, 0, clampedWidth, clampedHeight);
      const projection = twgl.m4.ortho(
        scratchBounds.left,
        scratchBounds.right,
        scratchBounds.top,
        scratchBounds.bottom,
        -1,
        1,
      );

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this._drawThese(
        [drawableID],
        ShaderManager.DRAW_MODE.straightAlpha,
        projection,
        {
          effectMask: ~ShaderManager.EFFECT_INFO.ghost.mask,
          framebufferWidth: canvas.width,
          framebufferHeight: canvas.height,
        },
      );

      const data = new Uint8Array(Math.floor(clampedWidth * clampedHeight * 4));
      gl.readPixels(
        0,
        0,
        clampedWidth,
        clampedHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      const imageData = new ImageData(
        new Uint8ClampedArray(data.buffer),
        clampedWidth,
        clampedHeight,
      );

      const ratio =
        (canvas as HTMLCanvasElement).getBoundingClientRect().width /
        canvas.width;

      return {
        imageData,
        x: canvasSpaceBounds.left * ratio,
        y: canvasSpaceBounds.bottom * ratio,
        width: canvasSpaceBounds.width * ratio,
        height: canvasSpaceBounds.height * ratio,
      };
    } finally {
      gl.deleteFramebuffer(bufferInfo.framebuffer);
    }
  }

  extractColor(x: number, y: number, radius: number): any | null {
    this._doExitDrawRegion();

    const scratchX = Math.round(
      this._nativeSize[0] *
        (x / (this._gl.canvas as HTMLCanvasElement).clientWidth - 0.5),
    );
    const scratchY = Math.round(
      -this._nativeSize[1] *
        (y / (this._gl.canvas as HTMLCanvasElement).clientHeight - 0.5),
    );

    const gl = this._gl;
    twgl.bindFramebufferInfo(gl, this._queryBufferInfo);

    const bounds = new Rectangle();
    bounds.initFromBounds(
      scratchX - radius,
      scratchX + radius,
      scratchY - radius,
      scratchY + radius,
    );

    const pickX = scratchX - bounds.left;
    const pickY = bounds.top - scratchY;

    gl.viewport(0, 0, bounds.width, bounds.height);
    const projection = twgl.m4.ortho(
      bounds.left,
      bounds.right,
      bounds.top,
      bounds.bottom,
      -1,
      1,
    );

    gl.clearColor(
      ...(this._backgroundColor4f as [number, number, number, number]),
    );
    gl.clear(gl.COLOR_BUFFER_BIT);
    this._drawThese(
      this._drawList,
      ShaderManager.DRAW_MODE.default,
      projection,
    );

    const data = new Uint8Array(Math.floor(bounds.width * bounds.height * 4));
    gl.readPixels(
      0,
      0,
      bounds.width,
      bounds.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );

    const pixelBase = Math.floor(4 * (pickY * bounds.width + pickX));
    const color = {
      r: data[pixelBase],
      g: data[pixelBase + 1],
      b: data[pixelBase + 2],
      a: data[pixelBase + 3],
    };

    if (this._debugCanvas) {
      this._debugCanvas.width = bounds.width;
      this._debugCanvas.height = bounds.height;
      const ctx = this._debugCanvas.getContext("2d")!;
      const imageData = ctx.createImageData(bounds.width, bounds.height);
      imageData.data.set(data);
      ctx.putImageData(imageData, 0, 0);
      ctx.strokeStyle = "black";
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
      ctx.rect(pickX - 4, pickY - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
    }

    return {
      data,
      width: bounds.width,
      height: bounds.height,
      color,
    };
  }

  _touchingBounds(drawableID: number): Rectangle | null {
    const drawable = this._allDrawables[drawableID];

    if (!drawable.skin || !drawable.skin.getTexture([100, 100])) return null;

    const bounds = drawable.getFastBounds(null);

    if (!this.offscreenTouching) {
      bounds.clamp(this._xLeft, this._xRight, this._yBottom, this._yTop);
    }

    bounds.snapToInt();

    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }
    return bounds;
  }

  _unsnappedTouchingBounds(drawableID: number): Rectangle | null {
    const drawable = this._allDrawables[drawableID];
    if (!drawable.skin || !drawable.skin.getTexture([100, 100])) return null;
    const bounds = drawable.getFastBounds(null);
    if (!this.offscreenTouching) {
      bounds.clamp(this._xLeft, this._xRight, this._yBottom, this._yTop);
    }
    if (bounds.width === 0 || bounds.height === 0) {
      return null;
    }
    return bounds;
  }

  _candidatesTouching(drawableID: number, candidateIDs: number[]): any[] {
    const bounds = this._touchingBounds(drawableID);
    const result: any[] = [];
    if (bounds === null) {
      return result;
    }
    for (let index = candidateIDs.length - 1; index >= 0; index--) {
      const id = candidateIDs[index];
      if (id !== drawableID) {
        const drawable = this._allDrawables[id];
        if (drawable.skin instanceof TextBubbleSkin) continue;
        if (drawable.skin && drawable._visible) {
          drawable.updateCPURenderAttributes();
          const candidateBounds = drawable.getFastBounds(null);

          candidateBounds.snapToInt();

          if (bounds.intersects(candidateBounds)) {
            result.push({
              id,
              drawable,
              intersection: Rectangle.intersect(bounds, candidateBounds),
            });
          }
        }
      }
    }
    return result;
  }

  _candidatesBounds(candidates: any[]): Rectangle {
    return candidates.reduce((memo: any, { intersection }: any) => {
      if (!memo) {
        return intersection;
      }
      return Rectangle.union(memo, intersection, __candidatesBounds);
    }, null);
  }

  updateDrawableSkinId(drawableID: number, skinId: number): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) return;
    drawable.skin = this._allSkins[skinId];
  }

  updateDrawablePosition(drawableID: number, position: [number, number]): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) return;
    drawable.updatePosition(position);
  }

  updateDrawableDirection(drawableID: number, direction: number): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) return;
    drawable.updateDirection(direction);
  }

  updateDrawableScale(drawableID: number, scale: [number, number]): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) return;
    drawable.updateScale(scale);
  }

  updateDrawableDirectionScale(
    drawableID: number,
    direction: number,
    scale: [number, number],
  ): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) return;
    drawable.updateDirection(direction);
    drawable.updateScale(scale);
  }

  updateDrawableVisible(drawableID: number, visible: boolean): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) return;
    drawable.updateVisible(visible);
  }

  updateDrawableEffect(
    drawableID: number,
    effectName: string,
    value: number,
  ): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) return;
    drawable.updateEffect(effectName, value);
  }

  updateDrawableProperties(
    drawableID: number,
    properties: Record<string, any>,
  ): void {
    const drawable = this._allDrawables[drawableID];
    if (!drawable) {
      return;
    }
    if ("skinId" in properties) {
      this.updateDrawableSkinId(drawableID, properties.skinId);
    }
    drawable.updateProperties(properties);
  }

  getFencedPositionOfDrawable(
    drawableID: number,
    position: [number, number],
  ): [number, number] {
    let x = position[0];
    let y = position[1];

    const drawable = this._allDrawables[drawableID];
    if (!drawable || !drawable._skin) {
      return [x, y];
    }

    const dx = x - drawable._position[0];
    const dy = y - drawable._position[1];
    const aabb = drawable._skin.getFenceBounds(drawable, __fenceBounds);
    const inset = Math.floor(Math.min(aabb.width, aabb.height) / 2);

    const sx = this._xRight - Math.min(FENCE_WIDTH, inset);
    if (aabb.right + dx < -sx) {
      x = Math.ceil(drawable._position[0] - (sx + aabb.right));
    } else if (aabb.left + dx > sx) {
      x = Math.floor(drawable._position[0] + (sx - aabb.left));
    }
    const sy = this._yTop - Math.min(FENCE_WIDTH, inset);
    if (aabb.top + dy < -sy) {
      y = Math.ceil(drawable._position[1] - (sy + aabb.top));
    } else if (aabb.bottom + dy > sy) {
      y = Math.floor(drawable._position[1] + (sy - aabb.bottom));
    }
    return [x, y];
  }

  penClear(penSkinID: number): void {
    this.dirty = true;
    const skin = this._allSkins[penSkinID] as PenSkin;
    skin.clear();
  }

  penPoint(penSkinID: number, penAttributes: any, x: number, y: number): void {
    this.dirty = true;
    const skin = this._allSkins[penSkinID] as PenSkin;
    skin.drawPoint(penAttributes, x, y);
  }

  penLine(
    penSkinID: number,
    penAttributes: any,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    this.dirty = true;
    const skin = this._allSkins[penSkinID] as PenSkin;
    skin.drawLine(penAttributes, x0, y0, x1, y1);
  }

  penStamp(penSkinID: number, stampID: number): void {
    this.dirty = true;
    const stampDrawable = this._allDrawables[stampID];
    if (!stampDrawable) {
      return;
    }

    const bounds = this._unsnappedTouchingBounds(stampID);
    if (!bounds) {
      return;
    }

    this._doExitDrawRegion();

    const skin = this._allSkins[penSkinID] as PenSkin;

    const gl = this._gl;
    twgl.bindFramebufferInfo(gl, skin._framebuffer);

    if (!this.useHighQualityRender) {
      bounds.snapToInt();
    }
    let x = this._nativeSize[0] * 0.5 + bounds.left;
    let y = this._nativeSize[1] * 0.5 - bounds.top;
    let width = bounds.width;
    let height = bounds.height;
    if (this.useHighQualityRender) {
      x = Math.floor(x * skin.renderQuality);
      y = Math.floor(y * skin.renderQuality);
      width = Math.ceil(width * skin.renderQuality);
      height = Math.ceil(height * skin.renderQuality);
    }
    gl.viewport(x, y, width, height);
    const projection = twgl.m4.ortho(
      bounds.left,
      bounds.right,
      bounds.top,
      bounds.bottom,
      -1,
      1,
    );

    if (!(stampDrawable.skin instanceof SpineSkin)) {
      this._drawThese([stampID], ShaderManager.DRAW_MODE.default, projection, {
        ignoreVisibility: true,
        framebufferWidth: this._nativeSize[0] * skin.renderQuality,
        framebufferHeight: this._nativeSize[1] * skin.renderQuality,
      });
      skin._silhouetteDirty = true;
    }
  }

  _createGeometry(): void {
    const quad = {
      a_position: {
        numComponents: 2,
        data: [
          -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
        ],
      },
      a_texCoord: {
        numComponents: 2,
        data: [1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1],
      },
      uv: {
        numComponents: 2,
        data: [1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1],
      },
    };
    this._bufferInfo = twgl.createBufferInfoFromArrays(this._gl, quad);
  }

  onNativeSizeChanged(event: any): void {
    this.dirty = true;
    const [width, height] = event.newSize;

    const gl = this._gl;
    const attachments = [{ format: gl.RGBA }, { format: gl.DEPTH_STENCIL }];

    if (!this._pickBufferInfo) {
      this._pickBufferInfo = twgl.createFramebufferInfo(
        gl,
        attachments,
        MAX_TOUCH_SIZE[0],
        MAX_TOUCH_SIZE[1],
      );
    }

    if (this._queryBufferInfo) {
      twgl.resizeFramebufferInfo(
        gl,
        this._queryBufferInfo,
        attachments,
        width,
        height,
      );
    } else {
      this._queryBufferInfo = twgl.createFramebufferInfo(
        gl,
        attachments,
        width,
        height,
      );
    }
    this._createFBO(gl, width, height);
  }

  enterDrawRegion(regionId: any, enter?: () => void, exit?: () => void): void {
    if (enter === undefined) enter = regionId.enter;
    if (exit === undefined) exit = regionId.exit;
    if (this._regionId !== regionId) {
      this._doExitDrawRegion();
      this._regionId = regionId;
      enter();
      this._exitRegion = exit;
    }
  }

  _doExitDrawRegion(): void {
    if (this._exitRegion !== null) {
      this._exitRegion();
    }
    this._exitRegion = null;
    this._regionId = null;
  }

  _drawThese(
    drawables: number[],
    drawMode: string,
    projection: any,
    opts: any = {},
  ): void {
    const gl = this._gl;
    let currentShader: any = null;
    if (this.spineManager) {
      this.spineManager.updateTime();
    }

    const framebufferSpaceScaleDiffers =
      "framebufferWidth" in opts &&
      "framebufferHeight" in opts &&
      opts.framebufferWidth !== this._nativeSize[0] &&
      opts.framebufferHeight !== this._nativeSize[1];

    const startIndex = Math.max(0, opts.startIndex ?? 0);
    const endIndex = Math.min(
      drawables.length,
      opts.endIndex ?? drawables.length,
    );

    for (
      let drawableIndex = startIndex;
      drawableIndex < endIndex;
      ++drawableIndex
    ) {
      const drawableID = drawables[drawableIndex];

      if (opts.filter && !opts.filter(drawableID)) continue;

      const drawable = this._allDrawables[drawableID];

      if (!drawable.getVisible() && !opts.ignoreVisibility) continue;

      const drawableScale = framebufferSpaceScaleDiffers
        ? [
            (drawable.scale[0] * opts.framebufferWidth) / this._nativeSize[0],
            (drawable.scale[1] * opts.framebufferHeight) / this._nativeSize[1],
          ]
        : drawable.scale;

      if (!drawable.skin || !drawable.skin.getTexture(drawableScale)) continue;

      if (drawable.skin instanceof SpineSkin) {
        this._doExitDrawRegion();
        drawable.skin.render(drawable, drawableScale, projection, opts);
        gl.enable(gl.BLEND);
        continue;
      }

      const uniforms: any = {};

      let effectBits = drawable.enabledEffects;
      effectBits &= Object.prototype.hasOwnProperty.call(opts, "effectMask")
        ? opts.effectMask
        : effectBits;
      if (drawable.enabledExtraEffect !== 0) {
        effectBits |= drawable.enabledExtraEffect;
        drawable.injectExtraEffectUniforms(uniforms);
      }
      const newShader = this._shaderManager.getShader(drawMode, effectBits);
      if (this._regionId !== newShader) {
        this._doExitDrawRegion();
        this._regionId = newShader;

        currentShader = newShader;
        gl.useProgram(currentShader.program);
        twgl.setBuffersAndAttributes(gl, currentShader, this._bufferInfo);
        Object.assign(uniforms, {
          u_projectionMatrix: projection,
        });
      }
      if (drawable.customizedProjection && drawMode !== "straightAlpha") {
        Object.assign(uniforms, {
          u_projectionMatrix: drawable.customizedProjection,
        });
      } else {
        Object.assign(uniforms, {
          u_projectionMatrix: projection,
        });
      }

      Object.assign(
        uniforms,
        drawable.skin.getUniforms(drawableScale),
        drawable.getUniforms(),
      );

      if (opts.extraUniforms) {
        Object.assign(uniforms, opts.extraUniforms);
      }

      if (uniforms.u_skin) {
        twgl.setTextureParameters(gl, uniforms.u_skin, {
          minMag: drawable.skin.useNearest(drawableScale, drawable)
            ? gl.NEAREST
            : gl.LINEAR,
        });
      }

      twgl.setUniforms(currentShader, uniforms);
      twgl.drawBufferInfo(gl, this._bufferInfo, gl.TRIANGLES);
    }

    this._regionId = null;
  }

  createImageFromTexture(
    gl: WebGLRenderingContext,
    texture: WebGLTexture,
    width: number,
    height: number,
  ): string {
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );

    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

    gl.deleteFramebuffer(framebuffer);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;

    const imageData = context.createImageData(width, height);
    imageData.data.set(data);
    context.putImageData(imageData, 0, 0);

    return canvas.toDataURL();
  }

  _getConvexHullPointsForDrawable(drawableID: number): number[][] {
    const drawable = this._allDrawables[drawableID];

    const [width, height] = drawable.skin.size;
    if (!drawable.getVisible() || width === 0 || height === 0) {
      return [];
    }

    drawable.updateCPURenderAttributes();

    const determinant = (
      A: Float32Array,
      B: Float32Array,
      C: Float32Array,
    ): number => (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);

    const leftHull: number[][] = [];
    const rightHull: number[][] = [];

    let leftEndPointIndex = -1;
    let rightEndPointIndex = -1;

    const _pixelPos = twgl.v3.create();
    const _effectPos = twgl.v3.create();

    let currentPoint: number[];

    for (let y = 0; y < height; y++) {
      _pixelPos[1] = y / height;

      let x = 0;
      for (; x < width; x++) {
        _pixelPos[0] = x / width;
        EffectTransform.transformPoint(drawable, _pixelPos, _effectPos);
        if (drawable.skin.isTouchingLinear(_effectPos)) {
          currentPoint = [x, y];
          break;
        }
      }

      if (x >= width) {
        continue;
      }

      while (leftEndPointIndex > 0) {
        if (
          determinant(
            new Float32Array(leftHull[leftEndPointIndex]),
            new Float32Array(leftHull[leftEndPointIndex - 1]),
            new Float32Array(currentPoint!),
          ) > 0
        ) {
          break;
        } else {
          --leftEndPointIndex;
        }
      }

      leftHull[++leftEndPointIndex] = currentPoint!;

      for (x = width - 1; x >= 0; x--) {
        _pixelPos[0] = x / width;
        EffectTransform.transformPoint(drawable, _pixelPos, _effectPos);
        if (drawable.skin.isTouchingLinear(_effectPos)) {
          currentPoint = [x, y];
          break;
        }
      }

      while (rightEndPointIndex > 0) {
        if (
          determinant(
            new Float32Array(rightHull[rightEndPointIndex]),
            new Float32Array(rightHull[rightEndPointIndex - 1]),
            new Float32Array(currentPoint!),
          ) < 0
        ) {
          break;
        } else {
          --rightEndPointIndex;
        }
      }

      rightHull[++rightEndPointIndex] = currentPoint!;
    }

    const hullPoints = leftHull;
    hullPoints.length = leftEndPointIndex + 1;
    for (let j = rightEndPointIndex; j >= 0; --j) {
      hullPoints.push(rightHull[j]);
    }

    return hull(hullPoints, Infinity) as number[][];
  }

  requestSnapshot(callback: (dataURI: string) => void): void {
    this.dirty = true;
    this._snapshotCallbacks.push(callback);
  }

  requestRenderSkeleton(): void {
    if (!this.spineManager) {
      console.warn("No spine manager to render");
      return;
    }
    if (this._frameCall) {
      return;
    }
    const frameCall = () => {
      this.dirty = true;

      const dirty = this.spineManager.isDirty();
      if (dirty) {
        this._frameCall = requestAnimationFrame(frameCall);
      } else {
        cancelAnimationFrame(this._frameCall);
        this._frameCall = null;
      }
    };
    frameCall();
  }
}

(RenderWebGL.prototype as any).canHazPixels =
  RenderWebGL.prototype.extractDrawableScreenSpace;

export default RenderWebGL;
