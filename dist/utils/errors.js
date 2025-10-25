"use strict";
// src/utils/errors.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerOpenError = exports.NetworkTimeoutError = exports.NetworkError = exports.RateLimitError = exports.ApiServerError = exports.ApiClientError = exports.ApiError = exports.TokenNotFoundError = exports.TokenRefreshError = exports.TokenExpiredError = exports.TokenError = exports.OAuthDeniedError = exports.OAuthConfigError = exports.OAuthError = exports.SDKError = void 0;
class SDKError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.SDKError = SDKError;
// OAuth errors
class OAuthError extends SDKError {
    constructor(message, details) {
        super(message, 'OAUTH_ERROR', details);
    }
}
exports.OAuthError = OAuthError;
class OAuthConfigError extends OAuthError {
    constructor(message, details) {
        super(message, details);
        this.code = 'OAUTH_CONFIG_ERROR';
    }
}
exports.OAuthConfigError = OAuthConfigError;
class OAuthDeniedError extends OAuthError {
    constructor(message = 'User denied authorization', details) {
        super(message, details);
        this.code = 'OAUTH_DENIED';
    }
}
exports.OAuthDeniedError = OAuthDeniedError;
// Token errors
class TokenError extends SDKError {
    constructor(message, details) {
        super(message, 'TOKEN_ERROR', details);
    }
}
exports.TokenError = TokenError;
class TokenExpiredError extends TokenError {
    constructor(message = 'Token expired', details) {
        super(message, details);
        this.code = 'TOKEN_EXPIRED';
    }
}
exports.TokenExpiredError = TokenExpiredError;
class TokenRefreshError extends TokenError {
    constructor(message, details) {
        super(message, details);
        this.code = 'TOKEN_REFRESH_FAILED';
    }
}
exports.TokenRefreshError = TokenRefreshError;
class TokenNotFoundError extends TokenError {
    constructor(message, details) {
        super(message, details);
        this.code = 'TOKEN_NOT_FOUND';
    }
}
exports.TokenNotFoundError = TokenNotFoundError;
// API errors
class ApiError extends SDKError {
    status;
    constructor(message, status, details) {
        super(message, 'API_ERROR', { ...details, status });
        this.status = status;
    }
}
exports.ApiError = ApiError;
class ApiClientError extends ApiError {
    constructor(message, details) {
        super(message, details?.status ?? 400, details);
        this.code = 'API_CLIENT_ERROR';
    }
}
exports.ApiClientError = ApiClientError;
class ApiServerError extends ApiError {
    constructor(message, details) {
        super(message, details?.status ?? 500, details);
        this.code = 'API_SERVER_ERROR';
    }
}
exports.ApiServerError = ApiServerError;
class RateLimitError extends ApiError {
    retryAfter;
    constructor(message = 'Rate limit exceeded', retryAfter, details) {
        super(message, 429, { ...details, retryAfter });
        this.retryAfter = retryAfter;
        this.code = 'RATE_LIMIT_EXCEEDED';
    }
}
exports.RateLimitError = RateLimitError;
// Network errors
class NetworkError extends SDKError {
    constructor(message, details) {
        super(message, 'NETWORK_ERROR', details);
    }
}
exports.NetworkError = NetworkError;
class NetworkTimeoutError extends NetworkError {
    constructor(message = 'Request timeout', details) {
        super(message, details);
        this.code = 'NETWORK_TIMEOUT';
    }
}
exports.NetworkTimeoutError = NetworkTimeoutError;
class CircuitBreakerOpenError extends NetworkError {
    constructor(message, details) {
        super(message, details);
        this.code = 'CIRCUIT_BREAKER_OPEN';
    }
}
exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
//# sourceMappingURL=errors.js.map