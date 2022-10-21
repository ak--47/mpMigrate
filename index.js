#! /usr/bin/env node

// THE GREAT MP REPORT MIGRATOR
// yes... you can move all your data, dashboards, reports, and custom entities to a new project with ease!
// read the docs. watch the video. plz.
// https://github.com/ak--47/mpMigrate
// 

//todo: local time to project time

require('dotenv').config();
const u = require('./utils.js');
const del = require('./deleteEntities.js');
let logs = ``;
const dayjs = require('dayjs');
const dateFormat = `YYYY-MM-DD`;
const deep = require('deep-object-diff');

async function main(
	source = {
		acct: "",
		pass: "",
		project: 1234,
		start: dayjs().format(dateFormat),
		end: dayjs().format(dateFormat),
		region: `US`
	},
	target = {
		acct: "",
		pass: "",
		project: 1234,
		region: `US`
	},
	opts = {
		transformEventsFunc: x => x,
		transformProfilesFunc: x => x,
		shouldGenerateSummary: null,
		shouldCopyEvents: null,
		shouldCopyProfiles: null,
		shouldCopyEntities: null,
		silent: false,
		skipPrompt: false,
	}) {

	global.SILENT = opts.silent || false;

	log(`WELCOME TO THE GREAT MIXPANEL PROJECT MIGRATOR
		(by AK) v1.08

this script can COPY data (events + users) as well as saved entities (dashboard, reports, schemas, cohorts, custom event/props) from one project to another`);
	const { envCredsSource, envCredsTarget } = u.getEnvCreds();

	//choose creds based on .env or params
	if (source.acct === '' && source.pass === '') {
		source = envCredsSource;
		log(`attempting to use .env for source credentials`);
	}

	if (target.acct === '' && target.pass === '') {
		target = envCredsTarget;
		log(`attempting to use .env for target credentials`);
	}

	if (isNotSet(source.acct) || isNotSet(source.pass)) {
		log(`	⚠️ ERROR: you did not specify service account credentials for your source project ⚠️`);
		log(`	please read the instructions and try again:\n\thttps://github.com/ak--47/mpMigrate#tldr`);
		process.exit(0);
	}

	//options
	let generateSummary, copyEvents, copyProfiles, copyEntities;
	const { transformEventsFunc, transformProfilesFunc, shouldGenerateSummary, shouldCopyEvents, shouldCopyProfiles, shouldCopyEntities } = opts;

	//PROMPT USER FOR OPTIONS (if not specified)
	if (isNotSet(shouldGenerateSummary) || isNotSet(shouldCopyEvents) || isNotSet(shouldCopyProfiles) || isNotSet(shouldCopyEntities)) {
		log(`first... i need to ask you a few questions...`);
		({ generateSummary, copyEvents, copyProfiles, copyEntities } = await u.userPrompt(source, target));
	} else {
		generateSummary = shouldGenerateSummary;
		copyEvents = shouldCopyEvents;
		copyProfiles = shouldCopyProfiles;
		copyEntities = shouldCopyEntities;
	}

	time('migrate', 'start');

	//SOURCE
	//validate service account & get workspace id
	log(`validating source service account...`, null, true);
	let sourceWorkspace = await u.validateServiceAccount(source);
	source.workspace = sourceWorkspace.id;
	let dataFolder = await u.makeProjectFolder(sourceWorkspace);
	source.localPath = dataFolder;
	source = { ...sourceWorkspace, ...source };
	log(`	... 👍 looks good`);

	let numEvents, numProfiles, sourceSchema, sourceCustEvents, sourceCustProps, sourceCohorts, sourceDashes, sourceFoundReports, sourceFoundMedia, sourceFoundText, sourceEmptyDashes;

	// get all events
	if (copyEvents || generateSummary) {
		log(`querying project for events since ${source.start} to ${source.end}`, null, true);
		numEvents = await u.getProjCount(source, `events`);
		log(`	... 👍 found ${u.comma(numEvents)} events`);
	}

	// get all users
	if (copyProfiles || generateSummary) {
		log(`querying project for users`, null, true);
		numProfiles = await u.getProjCount(source, `profiles`);
		log(`	... 👍 found ${u.comma(numProfiles)} users`);
	}

	if (generateSummary || copyEntities) {
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
			log(`	... found ${u.comma(sourceEmptyDashes.length)} empty dashboards; (these will NOT be copied)`);
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


	}

	if (generateSummary) {
		log(`stashing entity metadata in ${dataFolder}`, null, true);
		await u.saveLocalSummary({ sourceSchema, customEvents: sourceCustEvents, customProps: sourceCustProps, sourceCohorts, sourceDashes, sourceWorkspace, source, numEvents, numProfiles });
		log(`	... 👍 done`);
	}

	if (!copyEvents && !copyProfiles && !copyEntities) {
		log(`nothing else to do... quitting`);
		process.exit(0);
	}

	let intentString = ``;

	if (copyEvents) {
		intentString += `${u.comma(numEvents)} events\n`;
	}

	if (copyProfiles) {
		intentString += `${u.comma(numProfiles)} user profiles\n`;
	}

	if (copyEntities) {
		intentString += `${u.comma(sourceSchema.length)} events & props schema
${u.comma(sourceCustEvents.length)} custom events
${u.comma(sourceCustProps.length)} custom props
${u.comma(sourceCohorts.length)} cohorts
${u.comma(sourceDashes.length)} dashboards
${u.comma(sourceFoundReports)} reports
${u.comma(sourceFoundMedia)} media objects
${u.comma(sourceFoundText)} text cards`;
	}



	//the migration starts
	log(`\ni will now copy:\n

${intentString}	

from project: ${source.project} to project: ${target.project}	

`);
	let shouldContinue = opts.skipPrompt ? true : await u.userPrompt(null, null, true);

	if (!shouldContinue) {
		log(`aborting...`);
		process.exit(0);
	}

	if (!target.acct || !target.pass || !target.project) {
		log(`no target project specified, exiting...`);
		process.exit(0);
	}

	log(`\nPROCEEDING WITH COPY!\n`);

	//TARGET
	log(`validating target service account...`, null, true);
	let targetWorkspace = await u.validateServiceAccount(target);
	target.workspace = targetWorkspace.id;
	target = { ...targetWorkspace, ...target };
	log(`	... 👍 looks good`);

	let sourceExportEvents, targetImportEvents, sourceExportProfiles, targetImportProfiles, targetSchema, targetCustEvents, targetCustProps, targetCohorts, targetDashes;

	if (copyEvents) {
		log(`downloading ${u.comma(numEvents)} events...`, null, true);
		try {
			sourceExportEvents = await u.exportAllEvents(source);
			targetImportEvents = await u.sendEvents(source, target, transformEventsFunc);
			log(`sent ${u.comma(targetImportEvents.results.totalRecordCount)} events in ${u.comma(targetImportEvents.results.totalReqs)} requests; writing logfile...`);
			await u.writeFile(`${dataFolder}/eventLog.json`, JSON.stringify(targetImportEvents.responses, null, 2));
		} catch (e) {
			debugger;
		}

	}

	if (copyProfiles) {
		log(`downloading ${u.comma(numProfiles)} profiles...`, null, true);

		try {
			sourceExportProfiles = await u.exportAllProfiles(source, target);
			targetImportProfiles = await u.sendProfiles(source, target, transformProfilesFunc);
			log(`sent ${u.comma(numProfiles)} requests in ${u.comma(targetImportProfiles.responses.length)} requests; writing logfile...`);
			await u.writeFile(`${dataFolder}/profileLog.json`, JSON.stringify(targetImportProfiles.responses, null, 2));
		} catch (e) {
			debugger;
		}

	}

	if (copyEntities) {
		try {
			log(`uploading existing lexicon schema to new project...`, null, true);
			targetSchema = await u.postSchema(target, sourceSchema);
			log(`	... 👍 done`);
		}

		catch (e) {
			log(`	... ⛔️ failed to upload schema`);
			debugger;
		}

		try {
			log(`creating ${sourceCustEvents.length} custom events + ${sourceCustProps.length} custom props...`, null, true);
			if (sourceCustProps.length > 0) targetCustProps = await u.makeCustomProps(target, sourceCustProps);
			if (sourceCustEvents.length > 0) targetCustEvents = await u.makeCustomEvents(target, sourceCustEvents, sourceCustProps, targetCustProps);
			log(`	... 👍 done`);
		}
		catch (e) {
			log(`	... ⛔️ failed to create custom events + props`);
			debugger;
		}

		try {
			log(`creating ${sourceCohorts.length} cohorts...`, null, true);
			targetCohorts = await u.makeCohorts(source, target, sourceCohorts, sourceCustEvents, sourceCustProps, targetCustEvents, targetCustProps);
			log(`	... 👍 created ${u.comma(targetCohorts.length)} cohorts`);
		}
		catch (e) {
			log(`	... ⛔️ failed to create cohorts`);
			debugger;
		}

		try {
			log(`creating ${sourceDashes.length} dashboards with...\n\t${sourceFoundReports} reports\n\t${sourceFoundMedia} media object\n\t${sourceFoundText} text cards`, null, true);
			targetDashes = await u.makeDashes(source, target, sourceDashes, sourceCustEvents, sourceCustProps, sourceCohorts, targetCustEvents, targetCustProps, targetCohorts);
			log(`\t... 👍 created ${u.comma(targetDashes.dashes.length)} dashboards\n\t... 👍 created ${targetDashes.reports.length} reports\n\t... 👍 created ${targetDashes.media.length} media objects\n\t... 👍 created ${targetDashes.text.length} text cards`);
		}
		catch (e) {
			log(`	... ⛔️ failed to create dashboards`);
			debugger;
		}

	}

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
		targetImportProfiles
	};

	log(`all finished... thank you for playing the game`);
	time(`migrate`, `stop`);
	//write logs
	await u.writeFile(`${dataFolder}/log.txt`, logs);

	return everyThingTheScriptDid;
}


function log(message, data, hasResponse = false) {
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

function isNotSet(val) {
	return val === undefined || val === null;
}

module.exports = {
	projectCopy: main,
	entityDelete: del
};

//this allows the module to function as a standalone script
if (require.main === module) {
	main().then((result) => {
		process.exit(0);
	});

}
