/**
 * @author LK
 * Provides text measurement using a canvas 2D context.
 * TypeScript counterpart of the original `canvas-measurement-provider.js`.
 */
class CanvasMeasurementProvider {
  _ctx: CanvasRenderingContext2D;
  _cache: Record<string, number>;

  /**
   * @param {CanvasRenderingContext2D} ctx - Provides a canvas rendering context
   * with 'font' set to the text style of the text to be wrapped.
   */
  constructor(ctx: CanvasRenderingContext2D) {
    this._ctx = ctx;
    this._cache = {};
  }

  /**
   * Called by the TextWrapper before a batch of zero or more calls to measureText().
   */
  beginMeasurementSession(): void {}

  /**
   * Called by the TextWrapper after a batch of zero or more calls to measureText().
   */
  endMeasurementSession(...args: any): void {}

  /**
   * Measure a whole string as one unit.
   * @param {string} text - the text to measure.
   * @returns {number} - the length of the string.
   */
  measureText(text: string): number {
    if (!this._cache[text]) {
      this._cache[text] = this._ctx.measureText(text).width;
    }
    return this._cache[text];
  }
}

export default CanvasMeasurementProvider;
