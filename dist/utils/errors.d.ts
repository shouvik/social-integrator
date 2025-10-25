export declare class SDKError extends Error {
    code: string;
    details?: Record<string, unknown> | undefined;
    constructor(message: string, code: string, details?: Record<string, unknown> | undefined);
}
export declare class OAuthError extends SDKError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class OAuthConfigError extends OAuthError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class OAuthDeniedError extends OAuthError {
    constructor(message?: string, details?: Record<string, unknown>);
}
export declare class TokenError extends SDKError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class TokenExpiredError extends TokenError {
    constructor(message?: string, details?: Record<string, unknown>);
}
export declare class TokenRefreshError extends TokenError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class TokenNotFoundError extends TokenError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ApiError extends SDKError {
    status: number;
    constructor(message: string, status: number, details?: Record<string, unknown>);
}
export declare class ApiClientError extends ApiError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class ApiServerError extends ApiError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class RateLimitError extends ApiError {
    retryAfter?: number | undefined;
    constructor(message?: string, retryAfter?: number | undefined, details?: Record<string, unknown>);
}
export declare class NetworkError extends SDKError {
    constructor(message: string, details?: Record<string, unknown>);
}
export declare class NetworkTimeoutError extends NetworkError {
    constructor(message?: string, details?: Record<string, unknown>);
}
export declare class CircuitBreakerOpenError extends NetworkError {
    constructor(message: string, details?: Record<string, unknown>);
}
//# sourceMappingURL=errors.d.ts.map