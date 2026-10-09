import { MAX_BASE_URL_LENGTH, MAX_TOKEN_LENGTH } from './limits.js';
import { validateTargetUrl } from './security.js';

export function isValidToken(token) {
    return typeof token === 'string' && token.length > 0 && token.length <= MAX_TOKEN_LENGTH;
}

export function isValidProviderTargetConfig(providerConfig, regions) {
    return Boolean(
        providerConfig &&
        typeof providerConfig === 'object' &&
        typeof providerConfig.provider === 'string' &&
        typeof providerConfig.baseUrl === 'string' &&
        providerConfig.baseUrl.length > 0 &&
        providerConfig.baseUrl.length <= MAX_BASE_URL_LENGTH &&
        validateTargetUrl(providerConfig.baseUrl) &&
        (!providerConfig.region || Object.hasOwn(regions, providerConfig.region))
    );
}
