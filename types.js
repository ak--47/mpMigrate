
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
 * @property {function(): mpEvent} transformEventsFunc
 * @property {function(): mpUser} transformProfilesFunc
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


/**
 * @typedef {Object} mpEvent - a mixpanel event
 * @property {string} event - the event name
 * @property {mpProperties} properties - the event's properties
 */

/**
 * @typedef {Object} mpProperties - mixpanel event properties
 * @property {string} distinct_id - uuid of the end user
 * @property {string} time - the UTC time of the event
 * @property {string} $insert_id - 
 */

/**
 * @typedef {Object} mpUser - a mixpanel user profile
 * @property {string} $token - the project token
 * @property {string} $distinct_id - the uuid of the user
 * @property {profileDirective} - a `$set` style operation
 */


exports.unused = {};