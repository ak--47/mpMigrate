const URLs = require('./endpoints.js');
const blacklistKeys = URLs.blacklistKeys;
const fetch = require('axios').default;
const FormData = require('form-data');
const fs = require('fs').promises;
const { createWriteStream } = require('fs');
const makeDir = require('fs').mkdirSync;
const { pick } = require('underscore');
const dayjs = require('dayjs');
const path = require('path');
const dateFormat = `YYYY-MM-DD`;
const mpImport = require('mixpanel-import');
const prompt = require('prompt');
const { URLSearchParams } = require('url');
const axiosRetry = require('axios-retry');
const u = require('ak-tools');
const track = u.tracker('mp-migrate');

// retries on 503: https://stackoverflow.com/a/64076585
// TODO on 500, just change the report name
axiosRetry(fetch, {
	retries: 3, // number of retries
	retryDelay: (retryCount) => {
		console.log(`	retrying request... attempt: ${retryCount}`);
		return retryCount * 2000; // time interval between retries
	},
	retryCondition: (error) => {
		// if retry condition is not specified, by default idempotent requests are retried
		return error.response.status === 503 || error.response.status === 409;
	},
	onRetry: function (retryCount, error, requestConfig) {
		if (error.response.status === 409) {
		const oldEntity = JSON.parse(requestConfig.data);
		oldEntity.name += `copy`;
		const newEntity = JSON.stringify(oldEntity);
		requestConfig.data = newEntity;
		return requestConfig;
		}
		else {
			track('error', {runId, ...requestConfig.data})
			console.log('something is broken; please let AK know...')
		}
	}
}
);

/*
--------------
AUTH + STORAGE
--------------
*/

exports.getEnvCreds = function () {
	//sweep .env to pickup creds
	const envVarsSource = pick(process.env, `SOURCE_ACCT`, `SOURCE_PASS`, `SOURCE_PROJECT`, `SOURCE_DATE_START`, `SOURCE_DATE_END`, `SOURCE_REGION`, `SOURCE_DASH_ID`);
	const envVarsTarget = pick(process.env, `TARGET_ACCT`, `TARGET_PASS`, `TARGET_PROJECT`, `TARGET_REGION`);
	const sourceKeyNames = { SOURCE_ACCT: "acct", SOURCE_PASS: "pass", SOURCE_PROJECT: "project", SOURCE_DATE_START: "start", SOURCE_DATE_END: "end", SOURCE_REGION: "region", SOURCE_DASH_ID: "dash_id" };
	const targetKeyNames = { TARGET_ACCT: "acct", TARGET_PASS: "pass", TARGET_PROJECT: "project", TARGET_REGION: "region" };
	const envCredsSource = renameKeys(envVarsSource, sourceKeyNames);
	const envCredsTarget = renameKeys(envVarsTarget, targetKeyNames);

	if (dayjs(envCredsSource.start).isValid()) {
		envCredsSource.start = dayjs(envCredsSource.start).format(dateFormat);
	}

	else {
		envCredsSource.start = dayjs().format(dateFormat);
	}

	if (dayjs(envCredsSource.end).isValid()) {
		envCredsSource.end = dayjs(envCredsSource.end).format(dateFormat);
	}

	else {
		envCredsSource.end = dayjs().format(dateFormat);
	}

	// region defaults
	if (!envCredsSource.region) envCredsSource.region = `US`;
	if (!envCredsTarget.region) envCredsTarget.region = `US`;

	// dash_ids
	if (envCredsSource.dash_id) {
		envCredsSource.dash_id = envCredsSource.dash_id.split(",").map(a => Number(a.trim()));
		let dashIdsValid = envCredsSource.dash_id.every((dashId) => u.is(Number, dashId) && !isNaN(dashId));
		if (!dashIdsValid) {
			console.log(`ERROR: your source_dash_id needs to be a number (or a comma separated list of numbers) got:`);
			console.log(envCredsSource.dash_id.join('\t\n'));
			console.log('\ndouble check your .env and try again');
			process.exit(1);
		}

	}

	else {
		envCredsSource.dash_id = []
	}

	return {
		envCredsSource,
		envCredsTarget
	};

};

exports.validateServiceAccount = async function (creds) {
	let { acct: username, pass: password, project, region } = creds;
	let res = (await fetch(URLs.me(region), {
		auth: { username, password }
	}).catch((e) => {
		creds;
		debugger;
		console.error(`ERROR VALIDATING SERVICE ACCOUNT!`);
		console.error(`${e.message} : ${e.response.data.error}`);
		process.exit(1);
	})).data;

	//can the user access the supplied project
	if (res.results.projects[project]) {
		`pass: access`;
	} else {
		`fail: access`;
		console.error(`user: ${username} does not have access to project: ${project}\ndouble check your credentials and try again`);
		process.exit(1);

	}

	//ensure account is admin or higher
	let perms = res.results.projects[project].role.name.toLowerCase();
	if (['admin', 'owner'].some(x => x === perms)) {
		`pass: permissions`;
	} else {
		`fail: permissions`;
		console.error(`user: ${username} has ${perms} to project ${project}\nthis script requires accounts to have 'admin' or 'ower' permissions\nupdate your permissions and try again`);
		process.exit(1);

	}

	//find the global workspace id of the project
	let workspaces = [];
	for (let workSpaceId in res.results.workspaces) {
		workspaces.push(res.results.workspaces[workSpaceId]);
	}

	let globalView = workspaces.filter(x => x.project_id == project && x.is_global);

	if (globalView.length > 0) {
		`pass: global access`;
	} else {
		`fail: global access`;
		console.error(`user: ${username} does not have access to a global data view in ${project}\nthis script requires accounts to have access to a global data view\nupdate your permissions and try again`);
		process.exit(1);
	}

	//workspace metadata does not contain project name
	globalView[0].projName = res.results.projects[project].name;
	globalView[0].projId = project;

	// get project metadata
	let metaData = (await fetch(URLs.getMetaData(project, region), {
		auth: { username, password }
	}).catch((e) => {
		creds;
		debugger;
		console.error(`ERROR FETCHING ACCESS TOKENS!`);
		console.error(`${e.message} : ${e.response.data.error}`);
		process.exit(1);
	})).data.results;

	globalView[0].api_key = metaData.api_key;
	globalView[0].secret = metaData.secret;
	globalView[0].token = metaData.token;

	return globalView[0];
};

exports.makeProjectFolder = async function (workspace) {
	//make a folder for the data
	let folderPath = `./savedProjects/${workspace.projName} (${workspace.projId})`;
	try {
		makeDir(`./savedProjects/`);
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}
	try {
		makeDir(folderPath);
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	try {
		makeDir(path.resolve(`${folderPath}/exports`));
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	try {
		makeDir(path.resolve(`${folderPath}/payloads`));
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	try {
		makeDir(path.resolve(`${folderPath}/exports/profiles`));
	} catch (err) {
		if (err.code !== 'EEXIST') {
			throw err;
		}
	}

	return path.resolve(folderPath);
};

/*
------------
USER PROMPTS
------------
*/

exports.userPrompt = async function (source, target, shouldContinue) {
	//user input
	const yesNoRegex = /^(?:Yes|No|yes|no|y|n|Y|N)$/;
	const defaults = {
		pattern: yesNoRegex,
		type: 'string',
		required: true,
		message: 'please say "yes" or "no", or "y", or "n"',
		default: 'no',
		before: function (value) { return value?.toLowerCase(); }
	};

	if (shouldContinue) {
		const continueSchema = {
			properties: {
				shouldContinue: {
					description: `are you sure you want to continue?`,
					...defaults
				}
			}
		};

		continueSchema.properties.shouldContinue.default = 'yes';

		prompt.start();
		prompt.message = ``;
		let { shouldContinue } = await prompt.get(continueSchema);

		if (shouldContinue.includes('y')) {
			return true;
		} else {
			return false;
		}


	}

	const promptSchema = {
		properties: {
			generateSummary: {
				description: `do you want to generate a TEXT SUMMARY of project ${source.project}'s saved entities?`,
				...defaults
			},
			copyEvents: {
				description: `do you want to COPY EVENTS from project ${source.project} to project ${target.project}?`,
				...defaults
			},
			copyProfiles: {
				description: `do you want to COPY PROFILES from project ${source.project} to project ${target.project}?`,
				...defaults
			},
			copyEntities: {
				description: `do you want to COPY SAVED ENTITIES from project ${source.project} to project ${target.project}?${source.dash_id.length > 0 ? `\n\tNOTE: you have specified ${source.dash_id.length} dashboard(s) to copy...` : ""}`,
				...defaults
			}
		}
	};
	prompt.start();
	prompt.message = ``;
	let { generateSummary, copyEvents, copyProfiles, copyEntities } = await prompt.get(promptSchema);

	if (generateSummary.includes('y')) {
		generateSummary = true;
	} else {
		generateSummary = false;
	}

	if (copyEvents.includes('y')) {
		copyEvents = true;
	} else {
		copyEvents = false;
	}

	if (copyProfiles.includes('y')) {
		copyProfiles = true;
	} else {
		copyProfiles = false;
	}

	if (copyEntities.includes('y')) {
		copyEntities = true;
	} else {
		copyEntities = false;
	}

	console.log(``);

	return {
		generateSummary,
		copyEvents,
		copyProfiles,
		copyEntities
	};
};

async function failPrompt() {
	const yesNoRegex = /^(?:Yes|No|yes|no|y|n|Y|N)$/;
	const defaults = {
		pattern: yesNoRegex,
		type: 'string',
		required: true,
		message: 'please say "yes" or "no", or "y", or "n"',
		default: 'no',
		before: function (value) { return value?.toLowerCase(); }
	};


	const continueSchema = {
		properties: {
			shouldContinue: {
				description: `do you want to continue?`,
				...defaults
			}
		}
	};

	continueSchema.properties.shouldContinue.default = 'yes';

	prompt.start();
	prompt.message = ``;
	let { shouldContinue } = await prompt.get(continueSchema);

	if (shouldContinue.includes('y')) {
		console.log('...continuing\n');
		return true;
	} else {
		log('...quitting\n');
		return false;
	}
}

/*
-------
GETTERS
-------
*/

exports.getCohorts = async function (creds) {
	let { acct: username, pass: password, workspace, region } = creds;
	let res = (await fetch(URLs.getCohorts(workspace, region), {
		auth: { username, password }
	}).catch(async (e) => {
		creds;
		debugger;
		console.error(`ERROR GETTING COHORT`);
		console.error(`${e.message} : ${e.response.data.error}`);
		let shouldContinue = await failPrompt();
		if (shouldContinue) {
			return { data: { results: [] } };
		}
		else {
			process.exit(1);
		}

	})).data;

	return res.results;
};

exports.getAllDash = async function (creds) {
	let { acct: username, pass: password, workspace, region } = creds;
	let res = (await fetch(URLs.getAllDash(workspace, region), {
		auth: { username, password }
	}).catch(async (e) => {
		creds;
		console.error(`ERROR GETTING DASH`);
		console.error(`${e.message} : ${e.response.data.error}`);
		debugger;
		let shouldContinue = await failPrompt();
		if (shouldContinue) {
			return { data: { results: [] } };
		}
		else {
			process.exit(1);
		}
	})).data;

	return res.results;
};

exports.getDashReports = async function (creds, dashId) {
	let { acct: username, pass: password, workspace, region } = creds;
	let res = (await fetch(URLs.getSingleDash(workspace, dashId, region), {
		auth: { username, password }
	}).catch(async (e) => {
		creds;
		console.error(`ERROR GETTING REPORT`);
		console.error(`${e.message} : ${e.response.data.error}`);
		debugger;
		let shouldContinue = await failPrompt();
		if (shouldContinue) {
			return { data: { results: { contents: { report: [] } } } };
		}
		else {
			process.exit(1);
		}
	})).data?.results;

	const dashSummary = {
		reports: res.contents.report,
		media: res.contents.media,
		text: res.contents.text,
		layout: res.layout

	};

	return dashSummary;

};

exports.getSchema = async function (creds) {
	let { acct: username, pass: password, project, region } = creds;
	let res = (await fetch(URLs.getSchemas(project, region), {
		auth: { username, password }
	}).catch(async (e) => {
		creds;
		debugger;
		console.error(`ERROR GETTING SCHEMA!`);
		console.error(`${e.message} : ${e.response.data.error}`);
		let shouldContinue = await failPrompt();
		if (shouldContinue) {
			return { data: { results: [] } };
		}
		else {
			process.exit(1);
		}

	})).data;

	return res.results;

};

exports.getCustomEvents = async function (creds) {
	let { acct: username, pass: password, project, workspace, region } = creds;
	let res = (await fetch(URLs.getCustomEvents(workspace, region), {
		auth: { username, password }
	}).catch((e) => {
		creds;
		debugger;
		console.error(`ERROR GETTING CUSTOM EVENTS!`);
		console.error(`${e.message} : ${e.response.data.error}`);
	}))?.data;

	return res.custom_events;

};

exports.getCustomProps = async function (creds) {
	let { acct: username, pass: password, project, workspace, region } = creds;
	let res = (await fetch(URLs.getCustomProps(workspace, region), {
		auth: { username, password }
	}).catch(async (e) => {
		creds;
		debugger;
		console.error(`ERROR GETTING CUSTOM PROPS!`);
		console.error(`${e.message} : ${e.response.data.error}`);
		let shouldContinue = await failPrompt();
		if (shouldContinue) {
			return { data: { results: [] } };
		}
		else {
			process.exit(1);
		}

	})).data.results;

	return res;

};

/*
-------
SETTERS
-------
*/

exports.postSchema = async function (creds, schema) {
	let { acct: username, pass: password, project, region } = creds;

	schema = schema.filter(e => !e.entityType.includes('custom'));

	//remove "unknown" types by iterating through properties; they are not allowed by the API
	schema.forEach((singSchema, index) => {
		for (let prop in singSchema.schemaJson.properties) {
			if (singSchema.schemaJson.properties[prop].type === "unknown") {
				delete schema[index].schemaJson.properties[prop].type;
			}
		}
	});

	let extraParams = { "truncate": true };
	let params = { entries: schema, ...extraParams };
	let res = await fetch(URLs.postSchema(project, region), {
		method: `post`,
		auth: { username, password },
		data: params

	}).catch(async (e) => {
		params;
		console.error(`ERROR POSTING SCHEMA!`);
		console.error(`${e.message} : ${e.response.data.error}`);
		let shouldContinue = await failPrompt();
		if (shouldContinue) {
			return { data: { results: [] } };
		}
		else {
			process.exit(1);
		}
	});

	return res.data.results;
};


exports.makeCohorts = async function (sourceCreds, targetCreds, cohorts = [], sourceCustEvents = [], sourceCustProps = [], targetCustEvents = [], targetCustProps = []) {
	//TODO DEAL WITH CUSTOM PROPS + CUSTOM EVENTS in COHORT dfns
	let { acct: username, pass: password, workspace, project, region } = targetCreds;
	let results = [];

	// //match old and new custom entities
	// let sourceEntities = { custEvents: sourceCustEvents, custProps: sourceCustProps }
	// let targetEntities = { custEvents: targetCustEvents, custProps: targetCustProps }
	// let matchedEntities = await matchCustomEntities(sourceCreds, sourceEntities, targetEntities)

	createCohorts: for (const cohort of cohorts) {
		let failed = false;
		//get rid of disallowed keys
		blacklistKeys.forEach(key => delete cohort[key]);

		let createdCohort = await fetch(URLs.makeCohorts(workspace, region), {
			method: `post`,
			auth: { username, password },
			data: cohort

		}).catch((e) => {
			failed = true;
			cohort;
			console.error(`ERROR CREATING COHORT!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			if (!e.response.data.error.includes('already exists')) debugger;
			return {};
		});

		results.push(createdCohort?.data?.results);

		if (failed) {
			continue createCohorts;
		} else {
			await fetch(URLs.shareCohort(project, createdCohort.data.results.id), {
				method: 'post',
				auth: { username, password },
				data: { "id": createdCohort.data.results.id, "projectShares": [{ "id": project, "canEdit": true }] }
			}).catch((e) => {
				debugger;
			});
		}
	}

	return results;
};

exports.makeCustomProps = async function (creds, custProps) {
	let { acct: username, pass: password, project, workspace, region } = creds;
	let results = [];
	let customProperties = clone(custProps);
	loopCustomProps: for (const custProp of customProperties) {
		let failed = false;
		//get rid of disallowed keys 
		blacklistKeys.forEach(key => delete custProp[key]);

		//get rid of null keys
		for (let key in custProp) {
			if (custProp[key] === null) {
				delete custProp[key];
			}
		}

		//defaultPublic
		custProp.global_access_type = "on";

		//make the dashboard; get back id
		let createdCustProp = await fetch(URLs.createCustomProp(workspace, region), {
			method: `post`,
			auth: { username, password },
			data: custProp

		}).catch((e) => {
			failed = true;
			custProp;

			console.error(`ERROR MAKING CUST PROP! ${custProp.name}`);
			console.error(`${e.message} : ${e.response.data.error}`);
			if (!e.response.data.error.includes('already exists')) debugger;
			return {};

		});
		let customProp = createdCustProp?.data?.results;
		results.push(customProp);
		if (failed) {
			continue loopCustomProps;
		} else {
			// share custom event
			await fetch(URLs.shareCustProp(project, customProp.customPropertyId, region), {
				method: 'post',
				auth: { username, password },
				data: { "id": customProp.customPropertyId, "projectShares": [{ "id": project, "canEdit": true }] }
			}).catch((e) => {
				debugger;
			});
		}
	}

	return results;
};

//TODO DEAL WITH CUSTOM PROPS in CUSTOM EVENT dfns
exports.makeCustomEvents = async function (creds, custEvents, sourceCustProps = [], targetCustProps = []) {
	let { acct: username, pass: password, project, workspace, region } = creds;
	let results = [];

	// //match old and new custom entities
	// let sourceEntities = { custProps: sourceCustProps }
	// let targetEntities = { custProps: targetCustProps }
	// let matchedEntities = await matchCustomEntities(null, sourceEntities, targetEntities)
	let customEvents = clone(custEvents);
	loopCustomEvents: for (const custEvent of customEvents) {
		let failed = false;
		const { name, alternatives } = custEvent;
		//custom events must be posted as forms?!?
		let custPayload = new FormData();
		custPayload.append('name', name);
		custPayload.append('alternatives', JSON.stringify(alternatives));
		let headers = custPayload.getHeaders();

		let createdCustEvent = await fetch(URLs.createCustomEvent(workspace, region), {
			method: 'post',
			auth: { username, password },
			headers,
			data: custPayload,
		}).catch((e) => {
			failed = true;
			name;
			console.error(`ERROR MAKING CUST EVENT! ${name}`);
			console.error(`${e.message} : ${e.response.data.error}`);
			if (!e.response.data.error.includes('already exists')) debugger;
			return {};
		});

		let customEvent = createdCustEvent?.data?.custom_event;
		results.push(customEvent);

		//two outcomes
		if (failed) {
			continue loopCustomEvents;
		} else {
			// share custom event
			await fetch(URLs.shareCustEvent(project, customEvent?.id, region), {
				method: 'post',
				auth: { username, password },
				data: { "id": customEvent?.id, "projectShares": [{ "id": project, "canEdit": true }] }
			}).catch((e) => {
				debugger;
			});
		}
	}

	return results;
};

//TODO DASH FILTERS BREAK STUFF
exports.makeDashes = async function (sourceCreds, targetCreds, dashes = [], sourceCustEvents = [], sourceCustProps = [], sourceCohorts = [], targetCustEvents = [], targetCustProps = [], targetCohorts = []) {
	const { acct: username, pass: password, project, workspace, region } = targetCreds;
	let dashCount = -1;
	const OGDashes = clone(dashes);
	const results = {
		dashes: [],
		reports: [],
		shares: [],
		pins: [],
		text: [],
		media: [],
		layoutUpdates: [],
	};

	//match old and new custom entities by subbing olds Ids for new ones
	let sourceEntities = { custEvents: sourceCustEvents, custProps: sourceCustProps, cohorts: sourceCohorts };
	let targetEntities = { custEvents: targetCustEvents, custProps: targetCustProps, cohorts: targetCohorts };
	let matchedEntities = await matchCustomEntities(sourceCreds, sourceEntities, targetEntities);
	let matches = [...matchedEntities.cohorts, ...matchedEntities.custEvents, ...matchedEntities.custProps]
		.map(x => [x.sourceId, x.targetId])
		.filter(x => Boolean(x[0]) && Boolean(x[1]));
	let newDashes;
	for (const pairIds of matches) {
		const substitue = changeFactory(pairIds[0], pairIds[1]);
		newDashes = substitue(dashes);
	}

	if (!newDashes) newDashes = dashes;

	loopDash: for (const dash of newDashes) {
		let failed = false;
		dashCount++;
		//copy all child reports metadatas
		const reports = [];
		const media = [];
		const text = [];
		const layout = dash.LAYOUT;
		const reportResults = [];
		const mediaResults = [];
		const textResults = [];

		for (let reportId in dash.REPORTS) {
			reports.push(dash.REPORTS[reportId]);
		}
		for (let mediaId in dash.MEDIA) {
			media.push(dash.MEDIA[mediaId]);
		}
		for (let textId in dash.TEXT) {
			text.push(dash.TEXT[textId]);
		}

		//get rid of disallowed keys (this is backwards; u shuld whitelist)
		blacklistKeys.forEach(key => delete dash[key]);

		//get rid of null keys
		for (let key in dash) {
			if (dash[key] === null) {
				delete dash[key];
			}
		}

		//for every dash to have a desc
		if (!dash.description) {
			dash.description = dash.title;
		}

		//defaultPublic
		dash.global_access_type = "on";

		//make the dashboard; get back id
		let createdDash = await fetch(URLs.makeDash(workspace, region), {
			method: `post`,
			auth: { username, password },
			data: dash

		}).catch((e) => {
			//breaks on custom prop filters
			failed = true;
			dash;
			results;
			matchedEntities;
			console.error(`ERROR MAKING DASH! ${dash.title}`);
			console.error(`${e.message} : ${e.response.data.error}`);
			if (!e.response?.data?.error?.includes('already exists')) debugger;
			return {};

		});
		results.dashes.push(createdDash?.data?.results);

		if (failed) {
			continue loopDash;
		}
		//stash the old layout
		const oldDashLayout = OGDashes[dashCount].LAYOUT;

		//use new dash id to make reports
		const dashId = createdDash.data.results.id;
		targetCreds.dashId = dashId;
		const createdReports = await makeReports(targetCreds, reports, targetCustEvents, targetCustProps, targetCohorts, oldDashLayout);
		const createdMedia = await makeMedia(targetCreds, media, oldDashLayout);
		const createdText = await makeText(targetCreds, text, oldDashLayout);
		//ack ... refactor this junk
		results.reports.push(createdReports);
		reportResults.push(createdReports);
		results.media.push(createdMedia);
		mediaResults.push(createdMedia);
		results.text.push(createdText);
		textResults.push(createdText);

		//update shares
		let sharePayload = { "id": dashId, "projectShares": [{ "id": project, "canEdit": true }] };
		let sharedDash = await fetch(URLs.shareDash(project, dashId, region), {
			method: `post`,
			auth: { username, password },
			data: sharePayload
		}).catch((e) => {
			sharePayload;
			console.error(`ERROR SHARING DASH!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			debugger;
		});

		results.shares.push(sharedDash);

		//pin dashboards
		let pinnedDash = await fetch(URLs.pinDash(workspace, dashId, region), {
			method: `post`,
			auth: { username, password },
			data: {}
		}).catch((e) => {
			debugger;
		});

		results.pins.push(pinnedDash);

		// UPDATE LAYOUT
		const allCreatedEntities = [...reportResults, ...mediaResults, ...textResults].flat();
		const currentDashId = results.dashes.slice().pop().id;
		const mostRecentNewDashLayout = (await exports.getDashReports(targetCreds, currentDashId)).layout;
		//const mostRecentNewDashLayout = Object.values(results).flat().flat().pop().results.layout;
		const matchedDashLayout = reconcileLayouts(oldDashLayout, mostRecentNewDashLayout, allCreatedEntities);
		const layoutUpdate = await fetch(URLs.makeReport(workspace, dashId, region), {
			method: `patch`,
			auth: { username, password },
			data: JSON.stringify(matchedDashLayout)
		}).catch((e) => {
			matchedDashLayout;
			console.error(`ERROR UPDATING DASH LAYOUT!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			debugger;
			return {};
		});

		results.layoutUpdates.push(layoutUpdate);
	}

	results.reports = results.reports.flat();
	results.media = results.media.flat();
	results.text = results.text.flat();
	results.layoutUpdates = results.layoutUpdates.flat();
	return results;
};

/*
-----------
DATA EXPORT
-----------
*/

exports.exportAllEvents = async function (source) {
	const startDate = dayjs(source.start).format(dateFormat);
	const endDate = dayjs().format(dateFormat);
	const url = URLs.dataExport(startDate, endDate, source?.region);
	const file = path.resolve(`${source.localPath}/exports/events.ndjson`);
	const writer = createWriteStream(file);
	const auth = Buffer.from(source.secret + '::').toString('base64');
	const response = await fetch({
		method: 'GET',
		url,
		headers: {
			Authorization: `Basic ${auth}`
		},
		responseType: 'stream'
	});

	response.data.pipe(writer);

	//why can't i pass the fileName to resolve()
	return new Promise((resolve, reject) => {
		writer.on('finish', resolve);
		writer.on('error', reject);
	});

};

exports.exportAllProfiles = async function (source, target) {
	const auth = Buffer.from(source.secret + '::').toString('base64');
	let iterations = 0;
	let fileName = `people-${iterations}.json`;
	let folder = path.resolve(`${source.localPath}/exports/profiles/`);
	let file = path.resolve(`${folder}/${fileName}`);
	let response = (await fetch({
		method: 'POST',
		url: URLs.profileExport(source.projId, source?.region),
		headers: {
			Authorization: `Basic ${auth}`
		},
	})).data;

	let { page, page_size, session_id, total } = response;
	let lastNumResults = response.results.length;
	let profiles = response.results.map(function (person) {
		return {
			"$token": target.token,
			"$distinct_id": person.$distinct_id,
			"$ignore_time": true,
			"$ip": 0,
			"$set": {
				...person.$properties
			}
		};
	});
	// write first page of profiles
	await writeFile(file, JSON.stringify(profiles));

	const encodedParams = new URLSearchParams();

	// recursively consume all profiles
	// https://developer.mixpanel.com/reference/engage-query
	while (lastNumResults >= page_size) {
		page++;
		iterations++;

		fileName = `people-${iterations}.json`;
		file = path.resolve(`${folder}/${fileName}`);

		encodedParams.set('page', page);
		encodedParams.set('session_id', session_id);

		response = (await fetch({
			method: 'POST',
			url: URLs.profileExport(source.projId, source?.region),
			headers: {
				Authorization: `Basic ${auth}`
			},
			data: encodedParams
		})).data;

		profiles = response.results.map(function (person) {
			return {
				"$token": target.token,
				"$distinct_id": person.$distinct_id,
				"$ignore_time": true,
				"$ip": 0,
				"$set": {
					...person.$properties
				}
			};
		});
		await writeFile(file, JSON.stringify(profiles));

		// update recursion
		lastNumResults = response.results.length;


	}

	return folder;

};

exports.getProjCount = async function (source, type) {
	const startDate = dayjs(source.start).format(dateFormat);
	const endDate = dayjs(source.end).format(dateFormat);
	let payload;
	if (type === `events`) {
		payload = {
			"tracking_props": {
				"is_main_query_for_report": true,
				"report_name": "insights",
				"has_unsaved_changes": true,
				"query_reason": "qb_other_update"
			},
			"bookmark": {
				"sections": {
					"show": [{
						"dataset": "$mixpanel",
						"value": {
							"name": "$all_events",
							"resourceType": "events"
						},
						"resourceType": "events",
						"profileType": null,
						"search": "",
						"dataGroupId": null,
						"math": "total",
						"perUserAggregation": null,
						"property": null
					}],
					"cohorts": [],
					"group": [],
					"filter": [],
					"formula": [],
					"time": [{
						"dateRangeType": "between",
						"unit": "day",
						"value": [startDate, endDate]
					}]
				},
				"columnWidths": {
					"bar": {}
				},
				"displayOptions": {
					"chartType": "bar",
					"plotStyle": "standard",
					"analysis": "linear",
					"value": "absolute"
				},
				"sorting": {
					"bar": {
						"sortBy": "column",
						"colSortAttrs": [{
							"sortBy": "value",
							"sortOrder": "desc"
						}]
					},
					"line": {
						"sortBy": "value",
						"sortOrder": "desc",
						"valueField": "averageValue",
						"colSortAttrs": []
					},
					"table": {
						"sortBy": "column",
						"colSortAttrs": [{
							"sortBy": "label",
							"sortOrder": "asc"
						}]
					},
					"insights-metric": {
						"sortBy": "value",
						"sortOrder": "desc",
						"valueField": "totalValue",
						"colSortAttrs": []
					},
					"pie": {
						"sortBy": "value",
						"sortOrder": "desc",
						"valueField": "totalValue",
						"colSortAttrs": []
					}
				}
			},
			"queryLimits": {
				"limit": 10000
			},
			"use_query_cache": true,
			"use_query_sampling": false
		};
	} else if (type === `profiles`) {
		payload = {
			"tracking_props": {
				"is_main_query_for_report": true,
				"report_name": "insights",
				"has_unsaved_changes": true,
				"query_reason": "nav_from_other_report"
			},
			"bookmark": {
				"sections": {
					"show": [{
						"dataset": null,
						"value": { "name": "$all_people", "resourceType": "people" },
						"resourceType": "people",
						"profileType": "people",
						"search": "",
						"dataGroupId": null,
						"math": "total",
						"perUserAggregation": null,
						"property": null
					}],
					"cohorts": [],
					"group": [],
					"filter": [],
					"formula": [],
					"time": [{ "unit": "day", "value": 30 }]
				},
				"columnWidths": { "bar": {} },
				"displayOptions": { "chartType": "bar", "plotStyle": "standard", "analysis": "linear", "value": "absolute" },
				"sorting": { "bar": { "sortBy": "column", "colSortAttrs": [{ "sortBy": "value", "sortOrder": "desc" }] }, "line": { "sortBy": "value", "sortOrder": "desc", "valueField": "averageValue", "colSortAttrs": [] }, "table": { "sortBy": "column", "colSortAttrs": [{ "sortBy": "label", "sortOrder": "asc" }] }, "insights-metric": { "sortBy": "value", "sortOrder": "desc", "valueField": "totalValue", "colSortAttrs": [] }, "pie": { "sortBy": "value", "sortOrder": "desc", "valueField": "totalValue", "colSortAttrs": [] } }
			},
			"queryLimits": { "limit": 3000 },
			"use_query_cache": true,
			"use_query_sampling": false
		};
	} else {
		console.error(`only supported query types are "events" or "profiles"`);
		process.exit(1);
	}

	const opts = {
		method: 'POST',
		url: URLs.getInsightsReport(source.project, source?.region),
		headers: {
			Accept: 'application/json'

		},
		auth: {
			username: source.acct,
			password: source.pass
		},
		data: payload
	};

	let resTotal;

	try {
		resTotal = await fetch(opts);

		if (type === `events`) {
			return resTotal.data.series["All Events - Total"]?.all;
		} else if (type === `profiles`) {
			return resTotal.data.series["All User Profiles - Total"]?.value;
		}

	} catch (e) {
		source;
		type;
		debugger;
		console.error('ERROR GETTING COUNTS!');
		console.error(`${e.message} : ${e.response.data.error}`);

	}
};


/*
----------
DATA IMPORT
https://github.com/ak--47/mixpanel-import#credentials
----------
*/

exports.sendEvents = async function (source, target, transform) {
	const data = path.resolve(`${source.localPath}/exports/events.ndjson`);
	const creds = {
		acct: target.acct,
		pass: target.pass,
		project: target.project,
		token: target.token
	};

	const options = {
		recordType: `event`, //event, user, OR group
		streamSize: 27, // highWaterMark for streaming chunks (2^27 ~= 134MB)
		region: `US`, //US or EU
		recordsPerBatch: 2000, //max # of records in each batch
		bytesPerBatch: 2 * 1024 * 1024, //max # of bytes in each batch
		strict: true, //use strict mode?
		logs: true, //print to stdout?
		transformFunc: transform
	};
	const importedData = await mpImport(creds, data, options);

	return importedData;
};

exports.sendProfiles = async function (source, target, transform) {
	const data = path.resolve(`${source.localPath}/exports/profiles/`);
	const creds = {
		acct: target.acct,
		pass: target.pass,
		project: target.project,
		token: target.token
	};

	const options = {
		recordType: `user`, //event, user, OR group
		streamSize: 27, // highWaterMark for streaming chunks (2^27 ~= 134MB)
		region: `US`, //US or EU
		recordsPerBatch: 1000, //max # of records in each batch
		logs: true, //print to stdout?
		transformFunc: transform
	};
	const importedData = await mpImport(creds, data, options);

	return importedData;
};


/*
-------------
REPORT MAKERS
-------------
*/
const makeMedia = async function (creds, media = [], oldDashLayout) {
	let { acct: username, pass: password, project, workspace, dashId, region } = creds;
	let results = [];
	const OGMedia = clone(media);
	let mediaCount = -1;
	loopMedia: for (const mediaItem of media) {
		let failed = false;
		mediaCount++;

		const mediaCreate = { "content": { "action": "create", "content_type": "media", "content_params": { "media_type": "", "service": "", "path": "" } } };
		const createMediaCard = await fetch(URLs.makeReport(workspace, dashId, region), {
			method: `patch`,
			auth: { username, password },
			data: mediaCreate

		}).catch((e) => {
			failed = true;
			media;
			mediaItem;
			results;
			debugger;
			console.error(`ERROR CREATING MEDIA CARD!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			return {};
		});

		if (failed) continue loopMedia;
		const createdMediaCardId = createMediaCard.data.results.new_content.id;

		//get rid of disallowed keys
		blacklistKeys.forEach(key => delete mediaItem[key]);

		//null values make mixpanel unhappy; delete them too
		for (let key in mediaItem) {
			if (mediaItem[key] === null) {
				delete mediaItem[key];
			}
		}

		const payload = {
			"content":
			{
				"action": "update",
				"content_id": createdMediaCardId,
				"content_type": "media",
				"content_params": mediaItem
			}
		};

		let updatedMediaCard = await fetch(URLs.makeReport(workspace, dashId, region), {
			method: `patch`,
			auth: { username, password },
			data: payload

		}).catch((e) => {
			failed = true;
			media;
			results;
			console.error(`ERROR UPDATING MEDIA CARD!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			debugger;
			return {};
		});

		if (!failed) {
			const oldId = OGMedia[mediaCount].id;
			const oldRowId = Object.entries(oldDashLayout.rows).find(rowDfn => { return rowDfn[1].cells.find(cell => cell.content_id === oldId); })[0];
			updatedMediaCard.data.oldLayout = {
				rowNumber: oldDashLayout.order.findIndex(oldRow => oldRow === oldRowId),
				cellNumber: oldDashLayout.rows[oldRowId].cells.findIndex(cell => cell.content_id === oldId),
				width: oldDashLayout.rows[oldRowId].cells.find(cell => cell.content_id === oldId).width
			};

			const layout = updatedMediaCard.data.results.layout.rows[updatedMediaCard.data.results.layout.order.slice(-1).pop()].cells[0];

			updatedMediaCard.data.newLayout = {
				content_id: layout.content_id,
				id: layout.id,
				content_type: layout.content_type
			};
		}

		results.push(updatedMediaCard?.data || updatedMediaCard);
		if (failed) {
			continue loopMedia;
		}
	}


	return results;
};

const makeText = async function (creds, text = [], oldDashLayout) {
	let { acct: username, pass: password, project, workspace, dashId, region } = creds;
	let results = [];
	const OGText = clone(text);
	let textCount = -1;
	loopText: for (const textCard of text) {
		let failed = false;
		textCount++;

		const textCreate = { "content": { "action": "create", "content_type": "text", "content_params": { "markdown": "" } } };
		const createTextCard = await fetch(URLs.makeReport(workspace, dashId, region), {
			method: `patch`,
			auth: { username, password },
			data: textCreate

		}).catch((e) => {
			failed = true;
			textCard;
			results;
			console.error(`ERROR CREATING MEDIA CARD!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			debugger;
			return {};
		});

		if (failed) continue loopText;
		const createdTextCardId = createTextCard.data.results.new_content.id;

		//get rid of disallowed keys
		blacklistKeys.forEach(key => delete textCard[key]);

		//null values make mixpanel unhappy; delete them too
		for (let key in textCard) {
			if (textCard[key] === null) {
				delete textCard[key];
			}
		}

		const payload = {
			"content":
			{
				"action": "update",
				"content_id": createdTextCardId,
				"content_type": "text",
				"content_params": textCard
			}
		};

		let updatedTextCard = await fetch(URLs.makeReport(workspace, dashId, region), {
			method: `patch`,
			auth: { username, password },
			data: payload

		}).catch((e) => {
			failed = true;
			media;
			results;
			console.error(`ERROR UPDATING MEDIA CARD!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			debugger;
			return {};
		});

		if (!failed) {
			const oldId = OGText[textCount].id;
			const oldRowId = Object.entries(oldDashLayout.rows).find(rowDfn => { return rowDfn[1].cells.find(cell => cell.content_id === oldId); })[0];
			updatedTextCard.data.oldLayout = {
				rowNumber: oldDashLayout.order.findIndex(oldRow => oldRow === oldRowId),
				cellNumber: oldDashLayout.rows[oldRowId].cells.findIndex(cell => cell.content_id === oldId),
				width: oldDashLayout.rows[oldRowId].cells.find(cell => cell.content_id === oldId).width
			};

			const layout = updatedTextCard.data.results.layout.rows[updatedTextCard.data.results.layout.order.slice(-1).pop()].cells[0];

			updatedTextCard.data.newLayout = {
				content_id: layout.content_id,
				id: layout.id,
				content_type: layout.content_type
			};
		}

		results.push(updatedTextCard?.data || updatedTextCard);
		if (failed) {
			continue loopText;
		}
	}

	return results;
};

const makeReports = async function (creds, reports = [], targetCustEvents, targetCustProps, targetCohorts, oldDashLayout) {
	let { acct: username, pass: password, project, workspace, dashId, region } = creds;
	let results = [];
	const OGReport = clone(reports);
	let reportCount = -1;
	loopReports: for (const report of reports) {
		let failed = false;
		reportCount++;
		// report.global_access_type = "on";

		//get rid of disallowed keys
		blacklistKeys.forEach(key => delete report[key]);

		//null values make mixpanel unhappy; delete them too
		for (let key in report) {
			if (report[key] === null) {
				delete report[key];
			}
		}
		if (!report.description) report.description = report.name;

		//unsure why? ... but you gotta do it.
		report.params = JSON.stringify(report.params);

		const payload = {
			"content": {
				"action": "create",
				"content_type": "report",
				"content_params": {
					"bookmark": report
				}
			}
		};

		let createdReport = await fetch(URLs.makeReport(workspace, dashId, region), {
			method: `patch`,
			auth: { username, password },
			data: payload

		}).catch((e) => {
			failed = true;
			report;
			results;
			console.error(`ERROR CREATING REPORT!`);
			console.error(`${e.message} : ${e.response.data.error}`);
			debugger;
			return {};
		});

		if (!failed) {
			const oldId = OGReport[reportCount].id;
			const oldRowId = Object.entries(oldDashLayout.rows).find(rowDfn => { return rowDfn[1].cells.find(cell => cell.content_id === oldId); })[0];
			createdReport.data.oldLayout = {
				rowNumber: oldDashLayout.order.findIndex(oldRow => oldRow === oldRowId),
				cellNumber: oldDashLayout.rows[oldRowId].cells.findIndex(cell => cell.content_id === oldId),
				width: oldDashLayout.rows[oldRowId].cells.find(cell => cell.content_id === oldId).width
			};

			const layout = createdReport.data.results.layout.rows[createdReport.data.results.layout.order.slice(-1).pop()].cells[0];

			createdReport.data.newLayout = {
				content_id: layout.content_id,
				id: layout.id,
				content_type: layout.content_type
			};
		}

		results.push(createdReport?.data || createdReport);
		if (failed) {
			continue loopReports;
		}
	}


	return results;
};

/*
--------------------
PAYLOAD MANIPULATORS
--------------------
*/

const reconcileLayouts = function (oldDash, newDash, newDashItems) {
	const mappedLayout = newDashItems.map(item => {
		return {
			ids: item.newLayout, layout: item.oldLayout
		};
	});
	//const currentDashLayout = newDashItems.slice(-1).pop();
	const newLayout = {
		rows_order: [],
		rows: [] //rows: {}
	};

	const numRows = oldDash.order.length;
	const newRows = newDash.order.slice();	//slice(0, numRows);
	newLayout.rows_order = [...newRows];

	for (const [index, rowId] of Object.entries(newRows)) {
		let rowTemplate = {
			cells: [],
			height: 0,
			id: rowId
		};

		const itemsInRow = mappedLayout
			.filter(item => item.layout.rowNumber == index)
			.sort((a, b) => a.layout.cellNumber - b.layout.cellNumber);

		if (itemsInRow.length > 0) {

			//carefully place the card with the source layout settings but the target ids
			for (const card of itemsInRow) {
				rowTemplate.cells.push({
					//these two keys verify the match but are not required in the payload
					//content_id: card.ids.content_id,
					//content_type: card.ids.content_type,
					id: card.ids.id,
					width: card.layout.width
				});
			}
		}

		newLayout.rows.push(rowTemplate);

	}

	return { layout: newLayout };

};

const matchCustomEntities = async function (sourceCreds, sourceEntities, targetEntities) {
	let sourceCohortList = [];

	if (sourceCreds) {
		const { projId, workspace, acct, pass, region } = sourceCreds;
		sourceCohortList = (await fetch(URLs.listCohorts(projId, workspace, region), {
			method: `POST`,
			auth: { username: acct, password: pass }
		})).data;

	}
	let results = {
		cohorts: [],
		custEvents: [],
		custProps: []
	};

	sourceEntities.cohorts = sourceCohortList;

	//iterate through all source types and produce mappings of source and target
	let entityTypes = Object.keys(sourceEntities);
	for (const type of entityTypes) {
		for (const [index, entity] of Object.entries(sourceEntities[type])) {
			let template = {
				name: entity.name,
				sourceId: sourceEntities[type][index]?.id || sourceEntities[type][index]?.customPropertyId,
				targetId: targetEntities[type][index]?.id || targetEntities[type][index]?.customPropertyId,
			};
			results[type].push(template);
		}
	}

	return results;
};

const removeNulls = function (obj) {
	function isObject(val) {
		if (val === null) { return false; }
		return ((typeof val === 'function') || (typeof val === 'object'));
	}

	const isArray = obj instanceof Array;

	for (var k in obj) {
		// falsy values
		if (!Boolean(obj[k])) {
			isArray ? obj.splice(k, 1) : delete obj[k];
		}

		// empty arrays
		if (Array.isArray(obj[k]) && obj[k]?.length === 0) {
			delete obj[k];
		}

		// empty objects
		if (isObject(obj[k])) {
			if (JSON.stringify(obj[k]) === '{}') {
				delete obj[k];
			}
		}

		// recursion
		if (isObject(obj[k])) {
			removeNulls(obj[k]);
		}
	}
};

const changeFactory = function (sourceId = "", targetId = "") {

	return function changeValue(obj) {
		let source = JSON.stringify(obj);
		let target = source.split(sourceId).join(targetId);
		return JSON.parse(target);
	};
};

const renameKeys = function (obj, newKeys) {
	//https://stackoverflow.com/a/45287523
	const keyValues = Object.keys(obj).map(key => {
		const newKey = newKeys[key] || key;
		return {
			[newKey]: obj[key]
		};
	});
	return Object.assign({}, ...keyValues);
};

// https://stackoverflow.com/a/41951007
const clone = function (thing, opts) {
	var newObject = {};
	if (thing instanceof Array) {
		return thing.map(function (i) { return clone(i, opts); });
	} else if (thing instanceof Date) {
		return new Date(thing);
	} else if (thing instanceof RegExp) {
		return new RegExp(thing);
	} else if (thing instanceof Function) {
		return opts && opts.newFns ?
			new Function('return ' + thing.toString())() :
			thing;
	} else if (thing instanceof Object) {
		Object.keys(thing).forEach(function (key) {
			newObject[key] = clone(thing[key], opts);
		});
		return newObject;
	} else if ([undefined, null].indexOf(thing) > -1) {
		return thing;
	} else {
		if (thing.constructor.name === 'Symbol') {
			return Symbol(thing.toString()
				.replace(/^Symbol\(/, '')
				.slice(0, -1));
		}
		// return _.clone(thing);  // If you must use _ ;)
		return thing.__proto__.constructor(thing);
	}
};


/*
-----------------
MISC UTILITIES
-----------------
*/

const writeFile = async function (filename, data) {
	await fs.writeFile(filename, data);
};

const json = function (data) {
	return JSON.stringify(data, null, 2);
};

exports.comma = function (x) {
	try {
		return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	} catch (e) {
		return x;
	}
};

exports.writeFile = async function (filename, data) {
	await fs.writeFile(filename, data);
};

const openExplorerinMac = function (path, callback) {
	path = path || '/';
	let p = spawn('open', [path]);
	p.on('error', (err) => {
		p.kill();
		return callback(err);
	});
};

function log(message, data, hasResponse = false) {

	if (message) {
		console.log(message);
		// logs += `${message}`;
		if (!hasResponse) {
			console.log('\n');
			// logs += `\n`;
		}
	}

	if (data) {
		console.log('\n');
		console.log(JSON.stringify(data, null, 2));
		// logs += `${JSON.stringify(data, null, 2)}`;
		console.log('\n');
	}
}


/*
------------------
SUMMARY GENERATORS
------------------
*/
exports.saveLocalSummary = async function (projectMetaData) {
	const { sourceSchema: schema, customEvents, customProps, sourceCohorts: cohorts, sourceDashes: dashes, sourceWorkspace: workspace, source, numEvents, numProfiles } = projectMetaData;
	const summary = await makeSummary({ schema, customEvents, customProps, cohorts, dashes, workspace, numEvents, numProfiles });
	const writeSummary = await writeFile(path.resolve(`${source.localPath}/fullSummary.txt`), summary);
	const writeSchema = await writeFile(path.resolve(`${source.localPath}/payloads/schema.json`), json(schema));
	const writeCustomEvents = await writeFile(path.resolve(`${source.localPath}/payloads/customEvents.json`), json(customEvents));
	const writeCustomProps = await writeFile(path.resolve(`${source.localPath}/payloads/customProps.json`), json(customProps));
	const writeCohorts = await writeFile(path.resolve(`${source.localPath}/payloads/cohorts.json`), json(cohorts));
	const writeDashes = await writeFile(path.resolve(`${source.localPath}/payloads/dashboards.json`), json(dashes));

	//reveal the folder
	try {
		openExplorerinMac(path.resolve(`${source.localPath}`));
	}

	catch (e) {

	}
};

const makeSummary = async function (projectMetaData) {
	try {
		const { schema, customEvents, customProps, cohorts, dashes, workspace, numEvents, numProfiles } = projectMetaData;
		let title = `METADATA FOR PROJECT ${workspace.projId}\n\t${workspace.projName} (workspace ${workspace.id} : ${workspace.name})\n`;
		title += `\tcollected at ${dayjs().format('MM-DD-YYYY @ hh:MM A')}\n\n`;
		title += `EVENTS: ${exports.comma(numEvents)}\nPROFILES: ${exports.comma(numProfiles)}\n\n`;
		const schemaSummary = makeSchemaSummary(schema);
		const customEventSummary = makeCustomEventSummary(customEvents);
		const customPropSummary = makeCustomPropSummary(customProps);
		const cohortSummary = makeCohortSummary(cohorts);
		const dashSummary = makeDashSummary(dashes);
		const fullSummary = title + schemaSummary + customEventSummary + customPropSummary + dashSummary + cohortSummary;
		return fullSummary;
	} catch (e) {
		debugger;
		return false;
	}
};

const makeSchemaSummary = function (schema) {
	const title = ``;
	const events = schema.filter(x => x.entityType === 'event');
	const profiles = schema.filter(x => x.entityType === 'profile');
	const eventSummary = events.map(meta => `\t• ${meta.name}\t\t\t${meta.schemaJson.description}`).join('\n');
	const profileSummary = profiles.map(meta => `\t• ${Object.keys(meta.schemaJson.properties).join(', ')}`).join(', ');
	return `EVENTS:
${eventSummary}

PROFILE PROPS:
${profileSummary}
\n\n`;
};

const makeCustomEventSummary = function (customEvents) {
	const summary = customEvents.map((custEvent) => {
		return `\t• ${custEvent.name} (${custEvent.id}) = ${custEvent.alternatives.map((logic) => {
			return `${logic.event}`;
		}).join(' | ')}`;
	}).join('\n');


	return `
CUSTOM EVENTS:
${summary}
\n\n`;
};

const makeCustomPropSummary = function (customProps) {
	const summary = customProps.map((prop) => {
		let formula = prop.displayFormula;
		let variables = Object.entries(prop.composedProperties);
		for (const formulae of variables) {
			formula = formula.replace(formulae[0], `**${formulae[1].value}**`);
		}
		return `\t• ${prop.name} (${prop.customPropertyId})\t\t${prop.description}
${formula}\n`;
	}).join('\n');
	return `CUSTOM PROPS:
${summary}
\n\n`;
};

const makeCohortSummary = function (cohorts) {
	const summary = cohorts.map((cohort) => {
		let cohortLogic;
		try {
			cohortLogic = JSON.parse(JSON.stringify(cohort.groups));
			removeNulls(cohortLogic);
		} catch (e) {
			cohortLogic = `could not resolve cohort operators (cohort was likely created from a report)`;
		}
		return `\t• ${cohort.name} (${cohort.id})\t\t${cohort.description} (created by: ${cohort.created_by.email})
${JSON.stringify(cohortLogic, null, 2)}\n`;
	}).join('\n');
	return `COHORTS:
${summary}\n\n`;
};

const makeDashSummary = function (dashes) {
	dashes = dashes.filter(dash => Object.keys(dash.REPORTS).length > 0);
	const summary = dashes.map((dash) => {
		return `\t• DASH "${dash.title}" (${dash.id})\n\t${dash.description} (created by: ${dash.creator_email})

${makeReportSummaries(dash.REPORTS)}`;
	}).join('\n');
	return `DASHBOARDS\n
${summary}
\n\n`;
};

const makeReportSummaries = function (reports) {
	let summary = ``;
	let savedReports = [];
	let reportIds = Object.keys(reports);
	for (const reportId of reportIds) {
		savedReports.push(reports[reportId]);
	}
	for (const report of savedReports) {
		let reportLogic;
		try {
			if (report.type === `insights`) reportLogic = report.params.sections;
			if (report.type === `funnels`) reportLogic = report.params.steps;
			if (report.type === `retention`) reportLogic = report.params;
			if (report.type === `flows`) reportLogic = report.params.steps;
			reportLogic = clone(reportLogic);
			removeNulls(reportLogic);
		} catch (e) {
			reportLogic = `could not resolve report logic`;
		}
		summary += `\t\t\t→ REPORT: ${report.name} (${report.id} ${report.type.toUpperCase()})\n\t\t\t${report.description} (created by: ${report.creator_email})\n`;
		summary += `${JSON.stringify(reportLogic, null, 2)}`;
		summary += `\n\n`;
	}

	return summary;
};
