const mpTypes = require('./node_modules/mixpanel-import/types.js');

/**
 * @namespace types
 */

/**
 * @typedef {Object} Source
 * @property {string} [acct]
 * @property {string} [pass]
 * @property {string} [bearer]
 * @property {number | string} project
 * @property {string} [start]
 * @property {string} [end]
 * @property {string | number} [workspace]
 * @property {string} region
 * @property {string} [localPath]
 * @property {string} [auth]
 * @property {string[] | []} dash_id 
 */

/**
 * @typedef {Object} Target
 * @property {string} [acct]
 * @property {string} [pass]
 * @property {string} [bearer]
 * @property {string} region
 * @property {string | number} [workspace]
 * @property {string} [auth]
 * @property {number | string} project
 */

/**
 * @typedef {Object} Options
 * @property {function(): mpTypes.mpEvent} transformEventsFunc
 * @property {function(): mpTypes.mpUser} transformProfilesFunc
 * @property {boolean} shouldGenerateSummary
 * @property {boolean} shouldCopyEvents
 * @property {boolean} shouldCopyProfiles
 * @property {boolean} shouldCopyEntities
 * @property {boolean} shouldCopySchema
 * @property {boolean} silent
 * @property {boolean} skipPrompt
 */

/**
 * @typedef {Object} envCreds
 * @property {Source} envCredsSource
 * @property {Target} envCredsTarget
 */


/**
 * @typedef {Object} Summary
 * @property {Source} source
 * @property {Target} [target]
 * @property {Object[]} [sourceSchema]
 * @property {Object[]} [sourceCohorts]
 * @property {Object[]} [sourceDashes]
 * @property {Object[]} [targetSchema]
 * @property {Object[]} [targetCohorts]
 * @property {Object[]} [targetCustEvents]
 * @property {Object[]} [targetCustProps]
 * @property {Object[]} [targetDashes]
 * @property {Object[]} [targetReports]
 * @property {Object[]} [sourceExportEvents]
 * @property {string} [sourceExportProfiles]
 * @property {string} logs
 */



exports.unused = {};