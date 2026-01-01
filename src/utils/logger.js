const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const LOGS_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Get current date string in YYYY-MM-DD format
 * @returns {string}
 */
function getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

/**
 * Get current timestamp string
 * @returns {string}
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Log types enum
 */
const LogType = {
    REQUEST: 'request',
    SYSTEM: 'system_log',
    LLM: 'llm'
};

/**
 * Write log entry to file
 * @param {string} type - Log type (request, system_log, llm)
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
function writeLog(type, message, data = null) {
    const dateStr = getDateString();
    const fileName = `${type}_${dateStr}.log`;
    const filePath = path.join(LOGS_DIR, fileName);

    const logEntry = {
        timestamp: getTimestamp(),
        message,
        ...(data && { data })
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    fs.appendFile(filePath, logLine, (err) => {
        if (err) {
            console.error(`[Logger] Failed to write to ${fileName}:`, err.message);
        }
    });
}

/**
 * Logger object with methods for each log type
 */
const logger = {
    /**
     * Log HTTP request/response
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {number} duration - Request duration in ms
     */
    request(req, res, duration) {
        writeLog(LogType.REQUEST, 'HTTP Request', {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration_ms: duration,
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent'],
            body: req.method !== 'GET' ? req.body : undefined
        });
    },

    /**
     * Log system events
     * @param {string} level - Log level (info, warn, error)
     * @param {string} component - Component name
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    system(level, component, message, data = null) {
        writeLog(LogType.SYSTEM, message, {
            level,
            component,
            ...(data && { details: data })
        });

        // Also output to console
        const prefix = `[${component}]`;
        switch (level) {
            case 'error':
                console.error(prefix, message, data || '');
                break;
            case 'warn':
                console.warn(prefix, message, data || '');
                break;
            default:
                console.log(prefix, message, data || '');
        }
    },

    /**
     * Log LLM input/output
     * @param {string} provider - Provider name (gemini, mistral, onemin)
     * @param {string} model - Model name
     * @param {string} input - Input prompt/question
     * @param {string} output - Model response
     * @param {number} duration - Response time in ms
     * @param {boolean} success - Whether the call was successful
     * @param {string} error - Error message if failed
     */
    llm(provider, model, input, output, duration, success = true, error = null) {
        writeLog(LogType.LLM, 'LLM Call', {
            provider,
            model,
            input: input?.substring(0, 2000), // Truncate long inputs
            output: output?.substring(0, 2000), // Truncate long outputs
            input_length: input?.length,
            output_length: output?.length,
            duration_ms: duration,
            success,
            ...(error && { error })
        });
    },

    // Convenience methods for system logging
    info(component, message, data = null) {
        this.system('info', component, message, data);
    },

    warn(component, message, data = null) {
        this.system('warn', component, message, data);
    },

    error(component, message, data = null) {
        this.system('error', component, message, data);
    }
};

/**
 * Express middleware for request logging
 */
function requestLoggerMiddleware(req, res, next) {
    const startTime = Date.now();

    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.request(req, res, duration);
    });

    next();
}

module.exports = {
    logger,
    requestLoggerMiddleware,
    LogType
};
