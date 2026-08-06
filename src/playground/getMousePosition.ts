/**
 * Get the mouse position relative to a target element.
 * @param event - The mouse event.
 * @param target - The target element.
 * @returns Object with x and y coordinates relative to the target.
 */
function getMousePosition (event: MouseEvent, target: HTMLElement): { x: number; y: number } {
    const rect = target.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

export default getMousePosition;
