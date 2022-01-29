export default class RestException extends Error {
    constructor(statusCode, message) {
        super(statusCode, message);
        this.statusCode = statusCode;
        this.message = message;
    }
    name = 'RestException';
}
