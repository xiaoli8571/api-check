import primaryProviders from './primary-providers.json' with { type: 'json' };
import additionalProviders from './additional-providers.json' with { type: 'json' };

export const PRIMARY_PROVIDERS = primaryProviders;
export const ADDITIONAL_PROVIDERS = additionalProviders;

const providers = Object.freeze({
  ...PRIMARY_PROVIDERS,
  ...ADDITIONAL_PROVIDERS,
});

export default providers;
