const fs = require('fs');
const path = require('path');

/**
 * Logger Service
 * Provides structured logging with file output and console display
 */
class LoggerService {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Get current timestamp in ISO format
     */
    getTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Format log entry as JSON
     */
    formatLogEntry(level, message, meta = {}) {
        return JSON.stringify({
            timestamp: this.getTimestamp(),
            level,
            message,
            ...meta
        });
    }

    /**
     * Write to daily log file
     */
    writeToFile(entry) {
        const date = new Date().toISOString().split('T')[0];
        const filename = path.join(this.logDir, `${date}.log`);

        fs.appendFileSync(filename, entry + '\n');
    }

    /**
     * Log info level message
     */
    info(message, meta = {}) {
        const entry = this.formatLogEntry('INFO', message, meta);
        console.log(`[INFO] ${message}`, meta);
        this.writeToFile(entry);
    }

    /**
     * Log warning level message
     */
    warn(message, meta = {}) {
        const entry = this.formatLogEntry('WARN', message, meta);
        console.warn(`[WARN] ${message}`, meta);
        this.writeToFile(entry);
    }

    /**
     * Log error level message
     */
    error(message, meta = {}) {
        const entry = this.formatLogEntry('ERROR', message, meta);
        console.error(`[ERROR] ${message}`, meta);
        this.writeToFile(entry);
    }

    /**
     * Log debug level message (only in development)
     */
    debug(message, meta = {}) {
        if (process.env.NODE_ENV !== 'production') {
            const entry = this.formatLogEntry('DEBUG', message, meta);
            console.log(`[DEBUG] ${message}`, meta);
            this.writeToFile(entry);
        }
    }

    /**
     * Log API request/response
     */
    logApiCall(direction, endpoint, data, latencyMs = null) {
        const meta = {
            direction,
            endpoint,
            latency_ms: latencyMs,
            data_preview: typeof data === 'string'
                ? data.substring(0, 200)
                : JSON.stringify(data).substring(0, 200)
        };

        this.info(`API ${direction}: ${endpoint}`, meta);
    }

    /**
     * Log Messenger-specific events
     */
    logMessengerEvent(eventType, psid, details = {}) {
        this.info(`Messenger ${eventType}`, {
            platform: 'messenger',
            psid,
            ...details
        });
    }
}

module.exports = new LoggerService();
