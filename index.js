import mysql from 'mysql';
import config from './src/config.js';
import express from 'express';
import Router from './src/router.js';
import Logger from './src/utils/logger.js';

// If we're developing, log out the crash, but catch it
// in prod, the service will just write to sterr and restart
if (config.env == 'development') {
    process.on('uncaughtException', function (e) {
        console.log('!!!!!!!!!!!!!!!! HAVE FATAL ERR !!!!!!!!!!!!!!!!!', e);
    });
}

// set up server
const server = express();

// connect to db
const dbConn = mysql.createPool({
    connectionLimit: 10,
    host: config.db.mysql.host,
    user: config.db.mysql.user,
    password: config.db.mysql.password,
    database: config.db.mysql.name,
    timezone: config.db.mysql.timezone,
});

console.log(dbConn);

// set up logger
const logger = new Logger(config);
logger.setup();

// set up router
const router = new Router(server, dbConn, logger);
router.setup();

export default router;
