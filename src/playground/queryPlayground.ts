/**
 * Parse URL query parameters into an object.
 * @param queryString - The query string from URL (e.g., "?key=value&foo=bar").
 * @returns Object with parsed key-value pairs.
 */
function queryPlayground (queryString: string): Record<string, string> {
    const params: Record<string, string> = {};
    const search = queryString.replace(/^\?/, '');

    if (!search) {
        return params;
    }

    search.split('&').forEach(pair => {
        const [key, value] = pair.split('=');
        params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });

    return params;
}

export default queryPlayground;
