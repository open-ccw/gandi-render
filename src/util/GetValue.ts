/**
 * Safely get a nested value from an object by dot-separated string path.
 * @param obj - The source object.
 * @param path - Dot-separated path string (e.g., "a.b.c").
 * @param defaultValue - Default value returned when path does not exist.
 * @returns The resolved value or defaultValue.
 */
function GetValue (obj: any, path: string, defaultValue?: any): any {
    if (obj === null || obj === undefined) {
        return defaultValue;
    }

    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length; i++) {
        if (current === null || current === undefined) {
            return defaultValue;
        }
        current = current[keys[i]];
    }

    return current !== undefined ? current : defaultValue;
}

export default GetValue;
