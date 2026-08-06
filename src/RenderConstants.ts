/** @module RenderConstants */

/**
 * Various constants meant for use throughout the renderer.
 * @enum
 */
export default {
  /**
   * The ID value to use for "no item" or when an object has been disposed.
   * @const {number}
   */
  ID_NONE: -1,

  /**
   * Optimize for fewer than this number of Drawables sharing the same Skin.
   * Going above this may cause middleware warnings or a performance penalty but should otherwise behave correctly.
   * @const {number}
   */
  SKIN_SHARE_SOFT_LIMIT: Infinity,

  /**
   * @enum {string}
   */
  Events: {
    /**
     * Event for when the high quality render option is changed
     */
    UseHighQualityRenderChanged: "UseHighQualityRenderChanged",

    /**
     * NativeSizeChanged event
     *
     * @event RenderWebGL#event:NativeSizeChanged
     * @type {object}
     * @property {Array<int>} newSize - the new size of the renderer
     */
    NativeSizeChanged: "NativeSizeChanged",
  },
};
