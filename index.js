#! /usr/bin/env node

// THE GREAT MP REPORT MIGRATOR
// yes... you can move all your data, dashboards, reports, and custom entities to a new project with ease!
// read the docs. watch the video. plz.
// https://github.com/ak--47/mpMigrate
// 


/*
----
! MODULES
----
*/

const u = require('./utils.js');
const del = require('./deleteEntities.js');
const walkthrough = require('./cli.js');
const path = require('path');
const types = require('./types.js');


/*
----
! TOOLS
----
*/


const dayjs = require('dayjs');

const ak = require('ak-tools');
const track = ak.tracker('mp-migrate');
const runId = ak.uid(32);


/*
----
! GLOBALS
----
*/

let logs = ``;
const dateFormat = `YYYY-MM-DD`;
global.runId = runId;
global.dateFormat = dateFormat;



/**
 * mpMigrate!
 * @example
 * const { projectCopy } = require('mp-migrate')
 * const migration = await projectCopy(source, target, options)
 * @param {types.Source} source `{acct, pass, bearer, project, region, start, end, dash_id[]}`
 * @param {types.Target} target `{acct, pass, bearer, project, region}`
 * @param {types.Options} opts `{shouldGenerateSummary, shouldCopyEntities, shouldCopyEvents, shouldCopyProfiles, shouldCopySchema, silent, skipPrompt}`
 * @returns {Promise<types.Summary>}
 */
async function main(source, target, opts, isCli = false) {
	// * logs
	global.SILENT = opts.silent || false;

	// * defaults
	// @ts-ignore
	source = ak.objDefault(source, {
		acct: "",
		pass: "",
		bearer: "",
		project: 0,
		start: dayjs().format(dateFormat),
		end: dayjs().format(dateFormat),
		region: `US`,
		dash_id: []
	});
	// @ts-ignore
	target = ak.objDefault(target, {
		acct: "",
		pass: "",
		bearer: "",
		project: 0,
		region: `US`
	});
	// @ts-ignore
	opts = ak.objDefault(opts, {
		transformEventsFunc: x => x,
		transformProfilesFunc: x => x,
		shouldGenerateSummary: true,
		shouldCopyEvents: false,
		shouldCopyProfiles: false,
		shouldCopyEntities: false,
		shouldCopySchema: false,
		silent: false,
		skipPrompt: false,
	});

	// * .env
	if (!isCli && !(source.acct || source.pass) || !source.bearer) {
		const { envCredsSource, envCredsTarget } = walkthrough.getEnvCreds();
		source = envCredsSource;
		target = envCredsTarget;
	}

	// * validate source
	if ((isNotSet(source.acct) && isNotSet(source.pass)) && isNotSet(source.bearer)) {
		log(`	⚠️ ERROR: you did not specify service account or bearer token for your SOURCE project ⚠️`);
		log(`	please read the instructions and try again:\n\thttps://github.com/ak--47/mpMigrate#tldr`);
		process.exit(0);
	}

	buildAuth(source);
	let { dash_id } = source;
	if (!dash_id) dash_id = [];

	const { transformEventsFunc, transformProfilesFunc, shouldGenerateSummary, shouldCopyEvents, shouldCopyProfiles, shouldCopyEntities, shouldCopySchema, silent, skipPrompt } = opts;

	// * validate target
	if (shouldCopyEntities || shouldCopyProfiles || shouldCopyEvents || shouldCopySchema) {
		if ((isNotSet(target.acct) && isNotSet(target.pass)) && isNotSet(target.bearer)) {
			log(`	⚠️ ERROR: you did not specify service account or bearer token for your TARGET project ⚠️`);
			log(`	please read the instructions and try again:\n\thttps://github.com/ak--47/mpMigrate#tldr`);
			process.exit(0);
		}
	}
	buildAuth(target);
	time('migrate', 'start');
	track('start', { runId, ...opts });

	/*
	-------
	! FETCH SOURCE
	-------
	*/

	//SOURCE
	//validate service account & get workspace id
	log(`validating credentials...`, null, true);
	let sourceWorkspace = await u.validateServiceAccount(source);
	source.workspace = sourceWorkspace.id;
	let dataFolder = await u.makeProjectFolder(sourceWorkspace);
	source.localPath = dataFolder;
	source = { ...sourceWorkspace, ...source };
	log(`	... 👍 looks good`);

	let numEvents, numProfiles, sourceSchema, sourceCustEvents, sourceCustProps, sourceCohorts, sourceDashes, sourceFoundReports, sourceFoundMedia, sourceFoundText, sourceEmptyDashes;

	// get all events
	if (shouldCopyEvents || shouldGenerateSummary) {
		log(`querying project for events since ${source.start} to ${source.end}`, null, true);
		numEvents = await u.getProjCount(source, `events`);
		log(`	... 👍 found ${u.comma(numEvents)} events`);
	}

	// get all users
	if (shouldCopyProfiles || shouldGenerateSummary) {
		log(`querying project for users`, null, true);
		numProfiles = await u.getProjCount(source, `profiles`);
		log(`	... 👍 found ${u.comma(numProfiles)} users`);
	}

	if (shouldGenerateSummary || shouldCopyEntities) {
		//get the events schema
		log(`fetching schema for project: ${source.project}...`, null, true);
		sourceSchema = await u.getSchema(source);
		log(`	... 👍 found schema with ${u.comma(sourceSchema.length)} entries`);

		//custom events + props
		log(`fetching custom events for project: ${source.project}...`, null, true);
		sourceCustEvents = await u.getCustomEvents(source);
		log(`	... 👍 found ${u.comma(sourceCustEvents.length)} custom events`);

		log(`fetching custom props for project: ${source.project}...`, null, true);
		sourceCustProps = await u.getCustomProps(source);
		log(`	... 👍 found ${u.comma(sourceCustProps.length)} custom props`);

		//get cohorts
		log(`querying cohort metadata...`, null, true);
		sourceCohorts = await u.getCohorts(source);
		log(`	... 👍 ${u.comma(sourceCohorts.length)} cohorts`);

		//get metadata for all dashboards
		log(`querying dashboards metadata...`, null, true);
		sourceDashes = await u.getAllDash(source);
		log(`	... 👍 found ${u.comma(sourceDashes.length)} dashboards`);
		if (source?.dash_id?.length || 0 > 0) {
			sourceDashes = sourceDashes.filter((dash) => {
				return source.dash_id.some((specifiedId) => {
					return specifiedId === dash.id;
				});
			});
		}

		//for each dashboard, get metadata for every child report
		log(`querying reports metadata...`, null, true);
		sourceFoundReports = 0;
		sourceFoundMedia = 0;
		sourceFoundText = 0;
		for (const [index, dash] of sourceDashes.entries()) {
			let dashMeta = await u.getDashReports(source, dash.id);
			sourceFoundReports += Object.keys(dashMeta.reports).length;
			sourceFoundMedia += Object.keys(dashMeta.media).length;
			sourceFoundText += Object.keys(dashMeta.text).length;

			//store report metadata for later
			sourceDashes[index].REPORTS = dashMeta.reports;
			// TODO: adjust TEXT, MEDIA, and LAYOUT
			sourceDashes[index].MEDIA = dashMeta.media;
			sourceDashes[index].TEXT = dashMeta.text;
			sourceDashes[index].LAYOUT = dashMeta.layout;

		}
		log(`	... 👍 found ${u.comma(sourceFoundReports)} reports, ${u.comma(sourceFoundMedia)} media objects, ${u.comma(sourceFoundText)} text cards`);

		//filter out empty dashboards
		log(`checking for empty dashboards...`, null, true);
		sourceEmptyDashes = sourceDashes.filter(dash => {
			const sum = Object.keys(dash.REPORTS).length + Object.keys(dash.MEDIA).length + Object.keys(dash.TEXT).length;
			return sum === 0;
		});
		if (sourceEmptyDashes.length > 0) {
			log(`	... 👍 found ${u.comma(sourceEmptyDashes.length)} empty dashboards; (these will NOT be copied)`);
			sourceDashes = sourceDashes
				.filter(dash => {
					return !sourceEmptyDashes
						.some(emptyDash => {
							return JSON.stringify(dash) === JSON.stringify(emptyDash);
						});
				});
		}
		else {
			log(`	... found 0 empty dashboards`);
		}

		if (source.dash_id?.length > 0) {
			log(`filtering for SPECIFIC dashboards: ${source.dash_id.join(", ")}`, null, true);
			sourceDashes = sourceDashes.filter((dash) => {
				return source.dash_id.some((specifiedId) => {
					return specifiedId === dash.id;
				});
			});
			//find custom entities which the dashboard depends on
			const dependentReports = sourceDashes.map(dash => dash.REPORTS).map(dash => Object.values(dash)).flat().map(report => report.params).map(JSON.stringify);
			const dependentCohorts = sourceCohorts.map(cohort => cohort.id).filter(cohortId => dependentReports.some(reportString => reportString.includes(cohortId)));
			const dependentCustEvents = sourceCustEvents.map(custEvent => custEvent.id).filter(custEventId => dependentReports.some(reportString => reportString.includes(custEventId)));
			const dependentCustProps = sourceCustProps.map(custProp => custProp.customPropertyId).filter(custPropId => dependentReports.some(reportString => reportString.includes(custPropId)));
			log(`\t... 👍 found ${dependentCohorts.length} cohort(s), ${dependentCustEvents.length} custom event(s), & ${dependentCustProps.length} custom prop(s)\n\twhich the dashboard(s) depend on`);
			sourceCohorts = sourceCohorts.filter((cohort) => {
				return dependentCohorts.some(cohortId => cohortId === cohort.id);
			});
			sourceCustEvents = sourceCustEvents.filter((custEvent) => {
				return dependentCustEvents.some(custEvId => custEvId === custEvent.id);
			});
			sourceCustProps = sourceCustProps.filter((custProp) => {
				return dependentCustProps.some(custPropId => custPropId === custProp.customPropertyId);
			});
		}
	}

	if (shouldGenerateSummary) {
		log(`stashing entity metadata in ${dataFolder}`, null, true);
		await u.saveLocalSummary({ sourceSchema, customEvents: sourceCustEvents, customProps: sourceCustProps, sourceCohorts, sourceDashes, sourceWorkspace, source, numEvents, numProfiles });
		log(`	... 👍 done`);
	}

	if (!shouldCopyEvents && !shouldCopyProfiles && !shouldCopyEntities) {
		log(`nothing else to do... quitting`);
		process.exit(0);
	}

	let intentString = ``;

	if (shouldCopyEvents) {
		intentString += `${u.comma(numEvents)} events\n`;
	}

	if (shouldCopyProfiles) {
		intentString += `${u.comma(numProfiles)} user profiles\n`;
	}
	
	if (shouldCopyEntities) {
		if (dash_id.length === 0 && shouldCopySchema) {
			intentString += `${u.comma(sourceSchema.length)} events & props schema\n`;
		}
		intentString += `${u.comma(sourceCustEvents.length)} custom event(s)
${u.comma(sourceCustProps.length)} custom prop(s)
${u.comma(sourceCohorts.length)} cohort(s)
${u.comma(sourceDashes.length)} dashboard(s)
${u.comma(sourceFoundReports)} report(s)
${u.comma(sourceFoundMedia)} media object(s)
${u.comma(sourceFoundText)} text card(s)`;
	}



	//the migration starts
	log(`\ni will now copy:\n

${intentString}	

from project: ${source.project} to project: ${target.project}	

`);
	if (!skipPrompt) {
		await u.continuePrompt();
	}


	if (!target.auth || !target.project) {
		log(`no target project specified, exiting...`);
		process.exit(0);
	}

	/*
	-------
	! WRITE TO TARGET
	-------
	*/

	log(`\nPROCEEDING WITH COPY!\n`);

	//TARGET
	log(`validating target credentials...`, null, true);
	let targetWorkspace = await u.validateServiceAccount(target);
	target.workspace = targetWorkspace.id;
	target = { ...targetWorkspace, ...target };
	log(`	... 👍 looks good`);

	let sourceExportEvents, targetImportEvents, sourceExportProfiles, targetImportProfiles, targetSchema, targetCustEvents, targetCustProps, targetCohorts, targetDashes;

	if (shouldCopyEvents) {
		log(`downloading ${u.comma(numEvents)} events...`, null, true);
		try {
			sourceExportEvents = await u.exportAllEvents(source);
			targetImportEvents = await u.sendEvents(source, target, transformEventsFunc);
			log(`sent ${u.comma(targetImportEvents.success)} events in ${u.comma(targetImportEvents.batches)} requests; writing log file...`);
			await u.writeFile(`${dataFolder}/eventLog.json`, JSON.stringify(targetImportEvents, null, 2));
		} catch (e) {
			track('error', { type: "events", runId, ...opts });
			//debugger;
		}

	}

	if (shouldCopyProfiles) {
		log(`downloading ${u.comma(numProfiles)} profiles...`, null, true);

		try {
			sourceExportProfiles = await u.exportAllProfiles(source, target);
			targetImportProfiles = await u.sendProfiles(source, target, transformProfilesFunc);
			log(`sent ${u.comma(numProfiles)} requests in ${u.comma(targetImportProfiles.responses.length)} requests; writing log file...`);
			await u.writeFile(`${dataFolder}/profileLog.json`, JSON.stringify(targetImportProfiles.responses, null, 2));
		} catch (e) {
			track('error', { type: "profiles", runId, ...opts });
			//debugger;
		}

	}

	if (shouldCopySchema) {
		try {
			log(`uploading existing lexicon schema to new project...`, null, true);
			targetSchema = await u.postSchema(target, sourceSchema);
			log(`	... 👍 done`);
		}

		catch (e) {
			log(`	... ⛔️ failed to upload schema`);
			track('error', { type: "schema", runId, ...opts });
			//debugger;
		}

	}

	if (shouldCopyEntities) {
		try {
			log(`creating ${sourceCustEvents.length} custom event(s) + ${sourceCustProps.length} custom prop(s)...`, null, true);
			if (sourceCustProps.length > 0) targetCustProps = await u.makeCustomProps(target, sourceCustProps);
			if (sourceCustEvents.length > 0) targetCustEvents = await u.makeCustomEvents(target, sourceCustEvents, sourceCustProps, targetCustProps);
			log(`	... 👍 done`);
		}
		catch (e) {
			log(`	... ⛔️ failed to create custom events + props`);
			track('error', { type: "custom events", runId, ...opts });
			//debugger;

		}

		try {
			log(`creating ${sourceCohorts.length} cohort(s)...`, null, true);
			targetCohorts = await u.makeCohorts(source, target, sourceCohorts, sourceCustEvents, sourceCustProps, targetCustEvents, targetCustProps);
			log(`	... 👍 created ${u.comma(targetCohorts.length)} cohorts`);
		}
		catch (e) {
			log(`	... ⛔️ failed to create cohorts`);
			track('error', { type: "cohorts", runId, ...opts });
			//debugger;
		}

		try {
			log(`creating ${sourceDashes.length} dashboard(s) with...\n\t${sourceFoundReports} reports\n\t${sourceFoundMedia} media object\n\t${sourceFoundText} text cards`, null, true);
			targetDashes = await u.makeDashes(source, target, sourceDashes, sourceCustEvents, sourceCustProps, sourceCohorts, targetCustEvents, targetCustProps, targetCohorts);
			log(`\t... 👍 created ${u.comma(targetDashes.dashes.length)} dashboards\n\t... 👍 created ${targetDashes.reports.length} reports\n\t... 👍 created ${targetDashes.media.length} media objects\n\t... 👍 created ${targetDashes.text.length} text cards`);
		}
		catch (e) {
			log(`	... ⛔️ failed to create dashboards`);
			track('error', { type: "dashboards", runId, ...opts });
			//debugger;
		}

	}

	/*
	-------
	WRITE LOGS
	-------
	*/

	const everyThingTheScriptDid = {
		source,
		target,
		sourceSchema,
		sourceCohorts,
		sourceDashes,
		targetSchema,
		targetCohorts,
		targetCustEvents,
		targetCustProps,
		targetDashes: targetDashes?.dashes,
		targetReports: targetDashes?.reports,
		sourceExportEvents,
		sourceExportProfiles,
		targetImportEvents,
		targetImportProfiles,
		logs: path.resolve(dataFolder)
	};

	log(`all finished... thank you for playing the game`);
	time(`migrate`, `stop`);
	track('end', { runId, ...opts });
	//write logs
	await u.writeFile(`${dataFolder}/log.txt`, logs);
	await u.writeFile(`${dataFolder}/rawLog.json`, JSON.stringify(everyThingTheScriptDid, null, 2));

	return everyThingTheScriptDid;
}


/*
-------
UTILS
-------
*/

function log(message, data, hasResponse = false) {
	// @ts-ignore
	if (SILENT) {
		return;
	}
	if (message) {
		console.log(message);
		logs += `${message}`;
		if (!hasResponse) {
			console.log('\n');
			logs += `\n`;
		}
	}

	if (data) {
		console.log('\n');
		console.log(JSON.stringify(data, null, 2));
		logs += `${JSON.stringify(data, null, 2)}`;
		console.log('\n');
	}
}

function time(label = `foo`, directive = `start`) {
	if (directive === `start`) {
		console.time(label);
	} else if (directive === `stop`) {
		console.timeEnd(label);
	}

}

/**
 * 
 * @param {types.Source | types.Target} p 
 */
function buildAuth(p) {
	if (p.bearer) {
		p.auth = `Bearer ${p.bearer}`;
		return;
	}

	if (p.acct && p.pass) {
		p.auth = `Basic ${Buffer.from(p.acct + ":" + p.pass).toString('base64')}`;
		return;
	}

	console.error(`no bearer or service account for project ${p.project}`);
	throw Error('a bearer token token or service account is required!');

}


function isNotSet(val) {
	return val === undefined || val === null;
}

module.exports = {
	projectCopy: main,
	entityDelete: del
};

//this allows the module to function as a standalone script
if (require.main === module) {
	walkthrough.cli().then(answers => {
		const { source, target, options } = answers;
		return main(source, target, options, true);
	}).then((result) => {
		debugger;
		// process.exit(0);
	});

}
