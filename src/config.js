import dotenv from 'dotenv';
import mysql from 'mysql';

dotenv.config()

const config = {
    name: 'core-api',
    machinename: process.env.HOST_HOSTNAME || 'dev',
    hostname: 'http://localhost',
    version: '0.0.1',
    env: process.env.NODE_ENV || 'development',
    serverEnvironment: process.env.SERVER_ENV,
    port: process.env.PORT || 2020,
    logFile: process.env.LOG_FILE,
    db: {
        mysql: {
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            name: process.env.DB_NAME || 'core',
            timezone: 'UTC',
            connectionLimit: 10,
        },
    },
};

export default config;
