const log = {
    /**
     * Output an informational message.
     * @param args - Arguments to log.
     */
    info: function (...args: any[]): void {
        console.log('[Gandi-Render]', ...args);
    },

    /**
     * Output a warning message.
     * @param args - Arguments to log.
     */
    warn: function (...args: any[]): void {
        console.warn('[Gandi-Render]', ...args);
    },

    /**
     * Output an error message.
     * @param args - Arguments to log.
     */
    error: function (...args: any[]): void {
        console.error('[Gandi-Render]', ...args);
    }
};

export default log;
