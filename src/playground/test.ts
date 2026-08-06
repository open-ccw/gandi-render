/**
 * Playground test runner.
 * Used to quickly verify renderer functionality.
 */

// @ts-ignore
import RenderWebGL from '../RenderWebGL';

/**
 * Run a basic test to verify the renderer initializes correctly.
 * @param canvas - The canvas element to render to.
 * @returns True if the test passes, false otherwise.
 */
function runTest (canvas: HTMLCanvasElement): boolean {
    try {
        const renderer = new RenderWebGL(canvas);
        if (!renderer) {
            console.error('Failed to create RenderWebGL instance.');
            return false;
        }

        renderer.resize(480, 360);

        // Verify basic functionality
        if (typeof renderer.draw !== 'function') {
            console.error('RenderWebGL instance missing draw method.');
            return false;
        }

        console.log('RenderWebGL test passed.');
        return true;
    } catch (e) {
        console.error('RenderWebGL test failed:', e);
        return false;
    }
}

export default runTest;
