import {getLogger} from './log.js';
import {isValidURL} from './utils.js';
import {getAMPConsent} from './ampConsent.js';

export const ENDPOINT_RUBICON = 'https://prebid-server.rubiconproject.com/cookie_sync';
export const ENDPOINT_APPNEXUS = 'https://prebid.adnxs.com/pbs/v1/cookie_sync';
export const NO_LIMIT = 99999;
const DEFAULT_LIMIT = 10;

const DEFAULT_ENDPOINTS = {
    rubicon: ENDPOINT_RUBICON,
    appnexus: ENDPOINT_APPNEXUS
};

export function parseParams(params = new URLSearchParams(window.location.search)) {
    const debug = !!params.get('debug');
    const log = getLogger(debug);
    return {
        debug,
        endpoint: getEndpoint(params.get('endpoint'), log),
        args: parseArgs(params.get('args')),
        bidders: ((bidders) => bidders.length ? bidders : null)(splitCommas(params.get('bidders'))),
        limit: toInt(params.get('max_sync_count') || DEFAULT_LIMIT) || NO_LIMIT,
        isAmp: params.get('source')?.toLowerCase() === 'amp',
        coopSync: ((sync) => !sync || sync === 'true' || !!parseInt(sync))(params.get('coop_sync')),
        gdpr: booleanInt(params.get('gdpr')),
        gdpr_consent: params.get('gdpr_consent') || null,
        defaultGdprScope: booleanInt(params.get('defaultGdprScope')),
        gpp_sid: params.get('gpp_sid') || null,
        gpp: params.get('gpp') || null,
        timeout: toInt(params.get('timeout')) || null,
    };
}

function booleanInt(value) {
    value = toInt(value);
    return [0, 1].includes(value) ? value : null;
}

function getEndpoint(endpoint, log) {
    endpoint = endpoint || 'appnexus'; // default is appnexus for backwards compat
    if (DEFAULT_ENDPOINTS.hasOwnProperty(endpoint)) endpoint = DEFAULT_ENDPOINTS[endpoint];
    if (!isValidURL(endpoint)) {
        log(`Invalid endpoint: ${endpoint}. Defaulting to appnexus.`);
        endpoint = ENDPOINT_APPNEXUS;
    }
    return endpoint;
}

function parseArgs(argstr) {
    return splitCommas(argstr).reduce((args, token) => {
        const parts = token.split(':');
        if (parts.length === 2 && parts[0] && parts[1]) {
            args[parts[0]] = /^\d+$/.test(parts[1]) ? parseInt(parts[1], 10) : parts[1];
        }
        return args;
    }, {});
}

function toInt(val) {
    val = parseInt(val, 10);
    if (!Number.isNaN(val)) {
        return val;
    }
}

function splitCommas(value) {
    return (value || '').split(',').filter(el => el);
}

function resolveConsentParams(params, required, getConsent = getAMPConsent) {
    const log = getLogger(params.debug);
    log('Retrieving consent info from AMP...');
    return getConsent(params.timeout)
        .then(consent => Object.assign(params, consent))
        .catch(e => {
            const err = 'Error retrieving consent from AMP';
            log(err, e);
            if (!(params.defaultGdprScope ?? required)) {
                return params;
            } else {
                throw new Error(err);
            }
        });
}

export function resolveParams(params, alwaysPollAMP = false, resolveConsent = resolveConsentParams) {
    if (alwaysPollAMP || params.isAmp && params.gdpr == null) {
        return resolveConsent(params, alwaysPollAMP);
    } else {
        return Promise.resolve(params);
    }
}
