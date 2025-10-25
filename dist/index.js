"use strict";
// src/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerOpenError = exports.NetworkTimeoutError = exports.NetworkError = exports.RateLimitError = exports.ApiServerError = exports.ApiClientError = exports.ApiError = exports.TokenNotFoundError = exports.TokenRefreshError = exports.TokenExpiredError = exports.TokenError = exports.OAuthDeniedError = exports.OAuthConfigError = exports.OAuthError = exports.SDKError = exports.ConnectorSDK = void 0;
var sdk_1 = require("./sdk");
Object.defineProperty(exports, "ConnectorSDK", { enumerable: true, get: function () { return sdk_1.ConnectorSDK; } });
// Export error classes for error handling
var errors_1 = require("./utils/errors");
Object.defineProperty(exports, "SDKError", { enumerable: true, get: function () { return errors_1.SDKError; } });
Object.defineProperty(exports, "OAuthError", { enumerable: true, get: function () { return errors_1.OAuthError; } });
Object.defineProperty(exports, "OAuthConfigError", { enumerable: true, get: function () { return errors_1.OAuthConfigError; } });
Object.defineProperty(exports, "OAuthDeniedError", { enumerable: true, get: function () { return errors_1.OAuthDeniedError; } });
Object.defineProperty(exports, "TokenError", { enumerable: true, get: function () { return errors_1.TokenError; } });
Object.defineProperty(exports, "TokenExpiredError", { enumerable: true, get: function () { return errors_1.TokenExpiredError; } });
Object.defineProperty(exports, "TokenRefreshError", { enumerable: true, get: function () { return errors_1.TokenRefreshError; } });
Object.defineProperty(exports, "TokenNotFoundError", { enumerable: true, get: function () { return errors_1.TokenNotFoundError; } });
Object.defineProperty(exports, "ApiError", { enumerable: true, get: function () { return errors_1.ApiError; } });
Object.defineProperty(exports, "ApiClientError", { enumerable: true, get: function () { return errors_1.ApiClientError; } });
Object.defineProperty(exports, "ApiServerError", { enumerable: true, get: function () { return errors_1.ApiServerError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return errors_1.RateLimitError; } });
Object.defineProperty(exports, "NetworkError", { enumerable: true, get: function () { return errors_1.NetworkError; } });
Object.defineProperty(exports, "NetworkTimeoutError", { enumerable: true, get: function () { return errors_1.NetworkTimeoutError; } });
Object.defineProperty(exports, "CircuitBreakerOpenError", { enumerable: true, get: function () { return errors_1.CircuitBreakerOpenError; } });
//# sourceMappingURL=index.js.map