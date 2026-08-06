/**
 * Wrap text to fit within a maximum width.
 * @param text - The text to wrap.
 * @param maxWidth - Maximum allowed width in pixels.
 * @param measureFn - Function to measure the width of a string.
 * @returns The wrapped text with newlines.
 */
function wrapText (text: string, maxWidth: number, measureFn: (text: string) => number): string {
    if (!text) return '';

    const words = text.split('');
    let result = '';
    let currentLine = '';

    for (let i = 0; i < words.length; i++) {
        const char = words[i];
        const testLine = currentLine + char;
        const testWidth = measureFn(testLine);

        if (testWidth > maxWidth && currentLine.length > 0) {
            result += (result ? '\n' : '') + currentLine;
            currentLine = char;
        } else {
            currentLine = testLine;
        }
    }

    if (currentLine) {
        result += (result ? '\n' : '') + currentLine;
    }

    return result;
}

export default wrapText;
