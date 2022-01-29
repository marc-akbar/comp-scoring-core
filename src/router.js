import config from './config.js';

import mysqlHelper from './utils/mysqlHelper.js';
import Logger from './utils/logger.js';

export default class Router {
    dbConn = null;
    config = null;
    log = null;
    router = null;
    unauthenticatedNamespaces = ['auth', 'status'];

    constructor(server, dbConn, logger) {
        this.useTraits(mysqlHelper);

        if (!server) {
            throw new Error('No server passed into namespace abstract, killing server');
        }

        if (!dbConn) {
            dbConn = mysql.createPool({
                connectionLimit: 10,
                host: server.config.db.mysql.host,
                user: server.config.db.mysql.user,
                password: server.config.db.mysql.password,
                database: server.config.db.mysql.name,
                timezone: server.config.db.mysql.timezone,
            });
        }

        if (!logger) {
            logger = new Logger(server.config);
            logger.setupLogger();
        }

        this.log = logger;
        this.server = server;
        this.dbConn = dbConn;
        this.config = server.config;
    }

    setup = () => {
        this.log.info('Setting up router');

        const route = this.server;

        route.listen(config.port, () => {
            console.log(`Server listening on ${config.port}`);
        });

        route.get('/', (req, res) => {
            const message = 'Hello from server';
            res.send(message);
        });
    };

    // useTraits is a helper function which accepts an object of functions
    // and applies each function to this class
    useTraits = (trait) => Object.keys(trait).map((k) => (this[k] = trait[k].bind(this)));
}
