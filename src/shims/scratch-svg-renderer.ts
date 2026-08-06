/**
 * ESM-friendly shim for `scratch-svg-renderer`.
 *
 * The package is CommonJS (`module.exports = {...}`) and Vite's pre-bundler /
 * CommonJS interop does not reliably expose its named exports in the browser.
 * Import the whole CJS object and re-export the members we actually use as real
 * ESM named exports.
 */
// @ts-ignore
import ssr from "scratch-svg-renderer";

const { loadSvgString, serializeSvgToString } = ssr;

export { loadSvgString, serializeSvgToString };
export default ssr;
