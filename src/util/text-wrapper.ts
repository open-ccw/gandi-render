import CanvasMeasurementProvider from "./canvas-measurement-provider";

/**
 * Tell this text wrapper to use a specific measurement provider.
 * @typedef {object} MeasurementProvider - the new measurement provider.
 * @property {Function} beginMeasurementSession - this will be called before a batch of measurements are made.
 *      Optionally, this function may return an object to be provided to the endMeasurementSession function.
 * @property {Function} measureText - this will be called each time a piece of text must be measured.
 * @property {Function} endMeasurementSession - this will be called after a batch of measurements is finished.
 *      It will be passed whatever value beginMeasurementSession returned, if any.
 */

/**
 * Utility to wrap text across several lines, respecting Unicode grapheme clusters and, when possible, Unicode line
 * break opportunities.
 * Reference material:
 * - Unicode Standard Annex #14: http://unicode.org/reports/tr14/
 * - Unicode Standard Annex #29: http://unicode.org/reports/tr29/
 * - "JavaScript has a Unicode problem" by Mathias Bynens: https://mathiasbynens.be/notes/javascript-unicode
 *
 * This implementation uses the native `Intl.Segmenter` API (grapheme + line
 * granularity) instead of the Node-only `linebreak` / `grapheme-breaker`
 * packages, so it works in browser environments with zero extra dependencies.
 */
class TextWrapper {
  _measurementProvider: CanvasMeasurementProvider;
  _cache: Record<string, string[]>;
  private _lineSegmenter: Intl.Segmenter | null = null;
  private _graphemeSegmenter: Intl.Segmenter | null = null;

  /**
   * Construct a text wrapper which will measure text using the specified measurement provider.
   * @param {MeasurementProvider} measurementProvider - a helper object to provide text measurement services.
   */
  constructor(measurementProvider: CanvasMeasurementProvider) {
    this._measurementProvider = measurementProvider;
    this._cache = {};
  }

  /**
   * Lazily create (and reuse) the line-breaking segmenter.
   * @returns {Intl.Segmenter} segmenter with granularity "line".
   * @private
   */
  private _getLineSegmenter(): Intl.Segmenter {
    if (!this._lineSegmenter) {
      // `granularity: "line"` is supported at runtime but only typed in ES2024
      // Intl definitions (ES2022.Intl only exposes grapheme/word/sentence), so
      // cast through `unknown` to keep the native line-break capability.
      this._lineSegmenter = new Intl.Segmenter(undefined, {
        granularity: "line"
      } as unknown as Intl.SegmenterOptions);
    }
    return this._lineSegmenter;
  }

  /**
   * Lazily create (and reuse) the grapheme-cluster segmenter.
   * @returns {Intl.Segmenter} segmenter with granularity "grapheme".
   * @private
   */
  private _getGraphemeSegmenter(): Intl.Segmenter {
    if (!this._graphemeSegmenter) {
      this._graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    }
    return this._graphemeSegmenter;
  }

  /**
   * Find the index of the end of the grapheme cluster that starts at (or after)
   * `index` within `word`. Mirrors `GraphemeBreaker.nextBreak(word, index)`.
   * @param {string} word - the text to segment.
   * @param {number} index - the start position.
   * @returns {number} the next grapheme cluster boundary.
   * @private
   */
  private _nextGraphemeBoundary(word: string, index: number): number {
    const rest = word.slice(index);
    if (rest.length === 0) {
      return index;
    }
    const seg = Array.from(this._getGraphemeSegmenter().segment(rest))[0];
    return index + seg.index + seg.segment.length;
  }

  /**
   * Wrap the provided text into lines restricted to a maximum width. See Unicode Standard Annex (UAX) #14.
   * @param {number} maxWidth - the maximum allowed width of a line.
   * @param {string} text - the text to be wrapped. Will be split on whitespace.
   * @returns {Array.<string>} an array containing the wrapped lines of text.
   */
  wrapText(maxWidth: number, text: string): Array<string> {
    // Normalize to canonical composition (see Unicode Standard Annex (UAX) #15)
    text = text.normalize();

    const cacheKey = `${maxWidth}-${text}`;
    if (this._cache[cacheKey]) {
      return this._cache[cacheKey];
    }

    const measurementSession =
      this._measurementProvider.beginMeasurementSession();

    // Collect every line-break opportunity (position + whether it's a hard break).
    const breaks: Array<{ position: number; required: boolean }> = [];
    for (const seg of this._getLineSegmenter().segment(text)) {
      breaks.push({
        position: seg.index + seg.segment.length,
        // A segment that is (or ends in) a line terminator forces a new line.
        required: seg.segment === "\n" || seg.segment === "\r\n"
      });
    }

    let lastPosition = 0;
    let currentLine: string | null = null;
    const lines: string[] = [];

    for (const nextBreak of breaks) {
      const word = text
        .slice(lastPosition, nextBreak.position)
        .replace(/\n+$/, "");

      let proposedLine = (currentLine || "").concat(word);
      let proposedLineWidth =
        this._measurementProvider.measureText(proposedLine);

      if (proposedLineWidth > maxWidth) {
        // The next word won't fit on this line. Will it fit on a line by itself?
        const wordWidth = this._measurementProvider.measureText(word);
        if (wordWidth > maxWidth) {
          // The next word can't even fit on a line by itself. Consume it one grapheme cluster at a time.
          let lastCluster = 0;
          let nextCluster;
          while (
            lastCluster !==
            (nextCluster = this._nextGraphemeBoundary(word, lastCluster))
          ) {
            const cluster = word.substring(lastCluster, nextCluster);
            proposedLine = (currentLine || "").concat(cluster);
            proposedLineWidth =
              this._measurementProvider.measureText(proposedLine);
            if (currentLine === null || proposedLineWidth <= maxWidth) {
              // first cluster of a new line or the cluster fits
              currentLine = proposedLine;
            } else {
              // no more can fit
              lines.push(currentLine);
              currentLine = cluster;
            }
            lastCluster = nextCluster;
          }
        } else {
          // The next word can fit on the next line. Finish the current line and move on.
          if (currentLine !== null) lines.push(currentLine);
          currentLine = word;
        }
      } else {
        // The next word fits on this line. Just keep going.
        currentLine = proposedLine;
      }

      // Did we find a \n or similar?
      if (nextBreak.required) {
        if (currentLine !== null) lines.push(currentLine);
        currentLine = null;
      }

      lastPosition = nextBreak.position;
    }

    currentLine = currentLine || "";
    if (currentLine.length > 0 || lines.length === 0) {
      lines.push(currentLine);
    }

    this._cache[cacheKey] = lines;
    this._measurementProvider.endMeasurementSession(measurementSession);
    return lines;
  }
}

export default TextWrapper;
