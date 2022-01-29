import pino from 'pino';
import pinoCaller from 'pino-caller';
import util from 'util';

class Logger {
    logger = null;
    config = null;

    //loggers
    info = null;
    warn = null;
    error = null;
    debug = null;

    constructor(config) {
        if (!config) {
            throw new Error('No config passed in for logger');
        }
        this.config = config;
        this.inspect = this.inspect.bind(this);
        return this;
    }

    setup() {
        console.log('Setting up logger');
        const ENABLED = true;
        const NAME = 'core';
        let LOGLEVEL = 'info';
        let PRETTYPRINT = false;
        let DESTINATION = '';

        // DEVELOPMENT MODE logger config
        if (this.config.env != 'production') {
            PRETTYPRINT = { colorize: true, levelFirst: true, ignore: 'name,pid,hostname', translateTime: true };
            LOGLEVEL = 'debug';
            DESTINATION = this.config.logFile;
        }

        const loggerConfig = {
            enabled: ENABLED,
            name: NAME,
            logLevel: LOGLEVEL,
            prettyPrint: PRETTYPRINT,
        };

        if (DESTINATION) {
            this.logger = pino(loggerConfig, DESTINATION);
        } else {
            this.logger = pino(loggerConfig);
        }

        if (this.config.env != 'development') {
            this.logger = pinoCaller(this.logger);
        }

        this.info = this.logger.info.bind(this.logger);
        this.warn = this.logger.warn.bind(this.logger);
        this.error = this.logger.error.bind(this.logger);
        this.debug = this.logger.debug.bind(this.logger);
    }

    inspect(args) {
        Object.entries(args).map(([k, v]) => {
            console.log(`${k}: ${util.inspect(v, false, null, true)}`);
        });
    }
}

export default Logger;
