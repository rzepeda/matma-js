export class MatmaError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MatmaError';
    this.code = code;
    this.details = details;
  }
}

export const warn = (code, message, details = {}) => ({ code, message, ...details });
