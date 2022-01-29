import mysql from 'mysql';
import RestException from './restException.js';
import { promisify } from 'util';

const mysqlHelper = {
    getDBFromQuery: async function ({ query, overrides }) {
        const or = overrides || {};
        const dbConn = or.dbConn ? or.dbConn : this.dbConn;
        if (!dbConn) {
            throw new RestException(412, 'Missing database connection');
        }

        const sqlCommand = mysql.format(query);

        if (!or.logQuery && !sqlCommand.includes('SELECT')) {
            this.log.info({ action: this.action, sql: sqlCommand }, 'Running mysql query');
        }
        return await this.dbQuery(sqlCommand, dbConn);
    },

    getDBFromObj: async function ({ whereObj, options, selectArray, overrides }) {
        const or = overrides || {};
        const dbConn = or.dbConn ? or.dbConn : this.dbConn;
        const table = or.table ? or.table : this.table;
        const requiredFields = or.requiredFields ? or.requiredFields : this.requiredFields;
        const listFields = or.listFields ? or.listFields : this.listFields;
        const allowEmptyWhere = or.allowEmptyWhere ? or.allowEmptyWhere : false;
        const primaryKey = or.primaryKey || this.primaryKey;

        let allFields;
        if (or && or.allFields) {
            // override allFields
            allFields = or.allFields;
        } else if (or && or.table) {
            // querying another table, allow fields from whereObj
            allFields = { ...whereObj };
            selectArray.map((col) => (allFields[col] = ''));
        } else {
            // default to calling object's allFields
            allFields = this.allFields;
        }

        if (!dbConn) {
            throw new RestException(412, 'Missing database connection');
        }
        if (!table) {
            throw new RestException(412, 'Missing table');
        }

        const selectClause = this.buildSelectStatement({ selectArray: selectArray || listFields, allFields });
        let whereClause = '';
        if (whereObj) {
            whereClause = this.buildWhereClause({ whereObj, allFields });
        }
        let optionsClause = '';
        let optionsClauseWithoutLimit = false;
        if (options) {
            optionsClause = this.buildOptionsClause({ options, allFields });
        }
        let sqlCommand = `SELECT ${selectClause} FROM \`${table}\``;
        if (whereClause) {
            sqlCommand += ` WHERE ${whereClause}`;
        }
        if (optionsClause) {
            sqlCommand += optionsClause;
        }
        sqlCommand += ';';

        if (or.log) {
            this.log.info({ action: this.action, sql: sqlCommand }, 'Running mysql query');
        }

        let rows;
        try {
            rows = await this.dbQuery(sqlCommand, dbConn);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');
            throw new RestException(500, { error: 'Database error', message: err.message });
        }

        let sqlCountCommand = `SELECT COUNT(\`${primaryKey}\`) AS 'rowCount' FROM ${table} `;
        if (whereClause) {
            sqlCountCommand += ` WHERE ${whereClause}`;
        }
        sqlCountCommand += ';';

        if (or.log) {
            this.log.info({ action: this.action, sql: sqlCountCommand }, 'Running mysql count query');
        }

        let totalRecords;
        try {
            [totalRecords] = await this.dbQuery(sqlCountCommand, dbConn);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');
            throw new RestException(500, { error: 'Database error', message: err.message });
        }
        const metaData = { totalRecords: totalRecords.rowCount };
        if (options && options.pagination) {
            metaData.page = parseInt(options.pagination.page);
            metaData.records = parseInt(options.pagination.records);
        }
        return [rows, metaData];
    },

    deleteDBFromObj: async function ({ where, overrides }) {
        const or = overrides || {};
        const dbConn = or.dbConn ? or.dbConn : this.dbConn;
        const table = or.table ? or.table : this.table;
        let allFields = or.allFields ? or.allFields : this.allFields;
        if (!dbConn) {
            throw new RestException(412, 'Missing database connection');
        }
        if (!table) {
            throw new RestException(412, 'Missing table');
        }
        if (!where || !Object.keys(where) || !Object.keys(where).length) {
            throw new RestException(412, 'Missing "where" data to delete from db');
        }
        const whereClause = this.buildWhereClause({ whereObj: where, allFields });
        const sqlCommand = mysql.format(`DELETE FROM ?? WHERE ${whereClause}`, table);
        this.log.info({ action: this.action, sql: sqlCommand }, 'Running mysql delete query');
        let result;
        try {
            result = await this.dbQuery(sqlCommand, dbConn);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');
            throw new RestException(500, { error: 'Database error', message: err.message });
        }
        return result;
    },

    updateDBFromObj: async function ({ values, where, overrides }) {
        const or = overrides || {};
        const dbConn = or.dbConn ? or.dbConn : this.dbConn;
        const table = or.table ? or.table : this.table;
        let allFields = or.allFields ? or.allFields : this.allFields;
        if (!dbConn) {
            throw new RestException(412, 'Missing database connection');
        }
        if (!table) {
            throw new RestException(412, 'Missing table');
        }
        if (!values || !Object.keys(values) || !Object.keys(values).length) {
            throw new RestException(412, 'Missing data to update db');
        }
        if (!where || !Object.keys(where) || !Object.keys(where).length) {
            throw new RestException(412, 'Missing "where" data to update db');
        }
        let updateObj;
        if (overrides && overrides.table) {
            updateObj = values;
            allFields = where;
        } else {
            updateObj = this.filterObject({ rawObject: values, allowedFields: Object.keys(allFields) });
        }

        const whereClause = this.buildWhereClause({ whereObj: where, allFields });
        const sqlCommand = mysql.format(`UPDATE ?? SET ? WHERE ${whereClause}`, [table, updateObj]);
        this.log.info({ action: this.action, sql: sqlCommand }, 'Running mysql update query');

        let metaData;
        try {
            metaData = await this.dbQuery(sqlCommand, dbConn);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');
            throw new RestException(500, { error: 'Database error', message: err.message });
        }

        return [values, metaData];
    },

    addDBFromObj: async function ({ values, overrides }) {
        const or = overrides || {};
        const dbConn = or.dbConn ? or.dbConn : this.dbConn;
        const table = or.table ? or.table : this.table;
        const requiredFields = or.requiredFields ? or.requiredFields : this.requiredFields;
        const allFields = or.allFields ? or.allFields : this.allFields;
        if (!dbConn) {
            throw new RestException(412, 'Missing database connection');
        }
        if (!table) {
            throw new RestException(412, 'Missing table');
        }

        let insertObj;
        if (overrides && overrides.table) {
            insertObj = values;
        } else {
            insertObj = this.filterObject({ rawObject: values, allowedFields: Object.keys(allFields) });
            if (!this.validateRequiredFields({ fields: Object.keys(insertObj), requiredFields })) {
                throw new RestException(412, 'Missing required fields');
            }
        }

        const sqlCommand = mysql.format(`INSERT INTO ${table} (??) VALUES(?);`, [Object.keys(insertObj), Object.values(insertObj)]);
        this.log.info({ action: this.action, sql: sqlCommand }, 'Running mysql insert query');
        let result;
        try {
            result = await this.dbQuery(sqlCommand, dbConn);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');

            if (err.code == 'ER_DUP_ENTRY') {
                throw new RestException(409, { error: 'Duplicate entry in database', message: err.sqlMessage });
            } else {
                throw new RestException(500, { error: 'Database error', message: err.message });
            }
        }
        const dbKey = this.dbKey || 'id';
        values[dbKey] = result.insertId;
        return values;
    },

    upsertDBFromObj: async function ({ values, overrides }) {
        const or = overrides || {};
        const dbConn = or.dbConn ? or.dbConn : this.dbConn;
        const table = or.table ? or.table : this.table;
        const requiredFields = or.requiredFields ? or.requiredFields : this.requiredFields;
        const allFields = or.allFields ? or.allFields : this.allFields;
        if (!dbConn) {
            throw new RestException(412, 'Missing database connection');
        }
        if (!table) {
            throw new RestException(412, 'Missing table');
        }

        let insertObj;
        if (overrides && overrides.table) {
            insertObj = values;
        } else {
            insertObj = this.filterObject({ rawObject: values, allowedFields: Object.keys(allFields) });
            if (!this.validateRequiredFields({ fields: Object.keys(insertObj), requiredFields })) {
                throw new RestException(412, 'Missing required fields');
            }
        }

        const updateArray = Object.keys(insertObj).map((k) => {
            return ` \`${k}\`=${mysql.escape(values[k])}`;
        });

        const sqlCommand = mysql.format(`INSERT INTO ${table} (??) VALUES(?) ON DUPLICATE KEY UPDATE ${updateArray.join(',')}`, [Object.keys(insertObj), Object.values(insertObj)]);
        this.log.info({ action: this.action, sql: sqlCommand }, 'Running mysql upsert query');
        let result;
        try {
            result = await this.dbQuery(sqlCommand, dbConn);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');
            throw new RestException(500, { error: 'Database error', message: err.message });
        }
        values[this.dbKey] = result.insertId;
        return values;
    },

    addDB: async function (fields = null, overrides = {}) {
        const table = overrides.table || this.table;
        const identifier = overrides.identifier || this.primaryKey;
        const query = `INSERT INTO ?? SET ?`;
        const safeQuery = mysql.format(query, [table, fields]);
        this.log.info({ query: safeQuery }, 'Running get query');
        let rows;
        try {
            await this.dbQuery(safeQuery);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');
            return err;
        }
        return;
    },

    getFromDB: async function (whereObj = null, selectArr = '*', overrides = {}) {
        const table = overrides.table || this.table;
        const identifier = overrides.identifier || this.primaryKey;
        let safeQuery = '';
        if (whereObj) {
            let query = `SELECT ?? FROM ?? WHERE `;
            Object.keys(whereObj).map((k, i) => {
                if (i != 0) {
                    query += ' AND ';
                }
                query += ` \`${k}\` = ${mysql.escape(whereObj[k])}`;
            });
            safeQuery = mysql.format(query, [selectArr, table]);
        } else {
            const query = `SELECT ?? FROM ??`;
            safeQuery = mysql.format(query, [selectArr, table]);
        }
        this.log.info({ query: safeQuery }, 'Running get query');
        let rows;
        try {
            rows = await this.dbQuery(safeQuery);
        } catch (err) {
            this.log.debug({ errorStack: err.stack }, 'Error stack');
            this.log.error({ ...err, stack: 'turn on debug' }, 'Error querying database');
            return [null, err];
        }
        return [rows, null];
    },

    dbQuery: function (sql, dbConn, args) {
        const db = dbConn || this.dbConn;
        return promisify(db.query).call(db, sql, args);
    },

    getConnectionFromPool: function (dbConn) {
        return new Promise((resolve, reject) => {
            dbConn.getConnection(function (err, connection) {
                if (err) {
                    return reject(err);
                }
                resolve(connection);
            });
        });
    },

    beginTx: function (connection) {
        return new Promise((resolve, reject) => {
            connection.beginTransaction(function (err) {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    },

    commitTx: function (connection) {
        return new Promise((resolve, reject) => {
            connection.commit(function (err) {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    },

    rollbackTx: function (connection) {
        return new Promise((resolve, reject) => {
            connection.rollback(function (err) {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    },

    filterArray: function ({ inputArray, arrayToFilter }) {
        return inputArray.filter((v) => arrayToFilter.includes(v));
    },

    filterObject: function ({ rawObject, allowedFields }) {
        return Object.keys(rawObject)
            .filter((key) => allowedFields.includes(key))
            .reduce((obj, key) => {
                return {
                    ...obj,
                    [key]: rawObject[key],
                };
            }, {});
    },

    validateRequiredFields: function ({ fields, requiredFields }) {
        let valid = true;
        requiredFields.map((f) => {
            if (!fields.includes(f)) {
                valid = false;
            }
        });
        return valid;
    },

    buildSelectStatement: function ({ selectArray, allFields }) {
        if (selectArray == '*') {
            return selectArray;
        }
        const selectStatement = this.filterArray({ inputArray: selectArray, arrayToFilter: Object.keys(allFields) }).join('`,`');
        if (!selectStatement) {
            throw new RestException(417, 'Invalid search, must include valid params');
        }
        return '`' + selectStatement + '`';
    },

    buildOptionsClause: function ({ options, allFields }) {
        if (!options || !typeof options === 'object') {
            return;
        }

        let optionsClause = '';

        if (options.orderby) {
            let orderByClause = '';
            const filteredOptions = this.filterObject({ rawObject: options.orderby, allowedFields: Object.keys(allFields) });
            for (const [column, order] of Object.entries(filteredOptions)) {
                if (orderByClause) {
                    orderByClause += ', ';
                }
                orderByClause += `\`${column}\``;
                if (order) {
                    const orderUpper = order.toUpperCase();
                    if (['ASC', 'DESC'].includes(orderUpper)) {
                        orderByClause += ` ${orderUpper}`;
                    }
                }
            }
            if (orderByClause) {
                optionsClause += ` ORDER BY ${orderByClause}`;
            }
        }

        if (options.pagination && options.pagination.records && options.pagination.page) {
            const { page, records } = options.pagination;
            const start = parseInt(page) - 1;
            optionsClause += ` LIMIT ${start},${records}`;
        }
        return optionsClause;
    },

    buildWhereClause: function ({ whereObj, allFields }) {
        const filteredWhereObj = this.filterObject({ rawObject: whereObj, allowedFields: Object.keys(allFields) });
        if (!filteredWhereObj || !Object.keys(filteredWhereObj) || !Object.keys(filteredWhereObj).length) {
            this.log.warn({ action: this.action }, 'Missing data to select from the database: where');
            throw new RestException(412, `Missing data to select from the database: where - action: ${this.action}`);
        }
        let whereClause = '';
        for (const [k, v] of Object.entries(filteredWhereObj)) {
            const val = mysql.escape(v);
            if (whereClause) {
                whereClause += ' AND ';
            }
            if (val === 'NULL') {
                whereClause += `\`${k}\` IS ${val}`;
            } else {
                whereClause += `\`${k}\`=${val}`;
            }
        }
        return whereClause;
    },

    sqlEscape: mysql.escape,
    sqlFormat: mysql.format,
};

export default mysqlHelper;
