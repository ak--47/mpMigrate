
const { pick } = require('underscore');
const { rnKeys: renameKeys, is } = require('ak-tools');
const dayjs = require('dayjs');
const dateFormat = `YYYY-MM-DD`;
const types = require('./types.js');

// https://www.npmjs.com/package/inquirer
const inquirer = require('inquirer');


exports.cli = async function () {
	/** @type {types.Source} */
	let source = {};
	/** @type {types.Target} */
	let target = {};
	/** @type {types.Options} */
	let options = {};

	const ask = inquirer.createPromptModule();
	console.log(welcome);

	const whatIsYourPurpose = await ask(firstQuestions());
	if (!whatIsYourPurpose.intent) {
		console.log('\tthose are the only things i know how to do! sorry!\n');
		console.log(whomp);
		process.exit(0);
	}
	console.log(`\tcool... we can definitely do that... ${cool}\n`);


	console.log('checking for .env credentials...');

	({ envCredsSource: source, envCredsTarget: target } = exports.getEnvCreds());
	if (isValid(source) && isValid(target)) {
		console.log(`\t👍 yep... i see your credentials... ${letsgo}`);
	}

	//credentials
	else {
		console.log(`\t👎 didn't find a complete .env file... so...\n`);
		const howAuth = await ask(authQuestions());
		console.log('\n');
		if (howAuth.auth === "service") {
			const authSrc = await ask([
				...authQuestions("service", "SOURCE", source),
				...standardQuestions("SOURCE", source)
			]);
			console.log('\n');
			source.acct = authSrc.acct;
			source.pass = authSrc.pass;
			source.project = authSrc.project;
			source.region = authSrc.region;

			if (whatIsYourPurpose.intent === 'copy') {
				//need a target
				const authDest = await ask([
					...authQuestions("service", "TARGET", target),
					...standardQuestions("TARGET", target)
				]);

				target.acct = authDest.acct;
				target.pass = authDest.pass;
				target.project = authDest.project;
				target.region = authDest.region;
			}

		}

		if (howAuth.auth === "bearer") {
			const authSrc = await ask([
				...authQuestions("bearer", "SOURCE", source),
				...standardQuestions("SOURCE", source)
			]);

			source.bearer = authSrc.bearer;
			source.project = authSrc.project;
			source.region = authSrc.region;
			console.log('\n');
			if (whatIsYourPurpose.intent === 'copy') {
				//need a target	
				const authDest = await ask([
					...authQuestions("bearer", "TARGET", target),
					...standardQuestions("TARGET", target)
				]);

				target.bearer = authDest.bearer;
				target.project = authDest.project;
				target.region = authDest.region;
			}
		}
	}

	console.log('\n');

	// options
	if (whatIsYourPurpose.intent === 'copy') {
		const optConfig = await ask(optionsQuestions(source.project, target.project));
		options.shouldGenerateSummary = optConfig.shouldGenerateSummary;
		options.shouldCopyEvents = optConfig.shouldCopyEvents;
		options.shouldCopyProfiles = optConfig.shouldCopyProfiles;
		options.shouldCopySchema = optConfig.shouldCopySchema;
		options.shouldCopyEntities = true;
		source.dash_id = optConfig.dash_id
			?.split(",")
			?.map(s => s.trim())
			?.filter(a => a)
			?.map(Number) || [];

		if (optConfig.shouldCopyEvents) {
			console.log('\n');
			const dates = await ask(dateQuestions(source.project));
		}
	}

	else {
		options = {
			transformEventsFunc: x => x,
			transformProfilesFunc: x => x,
			shouldGenerateSummary: true,
			shouldCopyEvents: false,
			shouldCopyProfiles: false,
			shouldCopyEntities: false,
			shouldCopySchema: false,
			silent: false,
			skipPrompt: false,
		};
	}
	console.log("\n");
	return {
		source, target, options
	};
};



exports.getEnvCreds = function () {
	//sweep .env to pickup creds
	require('dotenv').config({ override: true });
	/** @type {types.Source} */
	let envCredsSource = {
		acct: "",
		pass: "",
		bearer: "",
		project: "",
		start: "",
		end: "",
		region: "",
		dash_id: []
	};

	/** @type {types.Target} */
	let envCredsTarget = {
		acct: "",
		pass: "",
		bearer: "",
		project: "",
		region: "US"
	};


	const envVarsSource = pick(process.env, `SOURCE_ACCT`, `SOURCE_PASS`, `SOURCE_PROJECT`, `SOURCE_DATE_START`, `SOURCE_DATE_END`, `SOURCE_REGION`, `SOURCE_DASH_ID`, `SOURCE_BEARER`);
	const envVarsTarget = pick(process.env, `TARGET_ACCT`, `TARGET_PASS`, `TARGET_PROJECT`, `TARGET_REGION`, `TARGET_BEARER`);
	const sourceKeyNames = { SOURCE_ACCT: "acct", SOURCE_PASS: "pass", SOURCE_PROJECT: "project", SOURCE_DATE_START: "start", SOURCE_DATE_END: "end", SOURCE_REGION: "region", SOURCE_DASH_ID: "dash_id", SOURCE_BEARER: "bearer" };
	const targetKeyNames = { TARGET_ACCT: "acct", TARGET_PASS: "pass", TARGET_PROJECT: "project", TARGET_REGION: "region", TARGET_BEARER: "bearer" };

	// @ts-ignore
	envCredsSource = renameKeys(envVarsSource, sourceKeyNames);
	// @ts-ignore
	envCredsTarget = renameKeys(envVarsTarget, targetKeyNames);

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
		// @ts-ignore
		envCredsSource.dash_id = envCredsSource.dash_id.split(",").map(a => Number(a.trim()));
		// @ts-ignore
		let dashIdsValid = envCredsSource.dash_id.every((dashId) => is(Number, dashId) && !isNaN(dashId));
		if (!dashIdsValid) {
			console.log(`ERROR: your source_dash_id needs to be a number (or a comma separated list of numbers) got:`);
			console.log(envCredsSource.dash_id.join('\t\n'));
			console.log('\ndouble check your .env and try again');
			process.exit(1);
		}

	}

	// else {
	// 	envCredsSource.dash_id = [];
	// }

	return {
		envCredsSource,
		envCredsTarget
	};

};

function notEmpty(str) {
	if (!str) return "your answer can't be empty...";
	return true;
}

function isValid(p) {
	if (!(p.acct && p.pass) && !p.bearer) {
		return false;
	}

	if (!p.project) {
		return false;
	}


	return true;
}

function dashCopyValidate(answer) {
	try {
		if (answer === "") return true;
		const parsed = answer.split(",")
			.map(s => s.trim())
			.filter(a => a)
			.map(Number);
		if (parsed.every((dashId) => is(Number, dashId) && !isNaN(dashId))) {
			return true
		}
		else {
			return "board ids are numbers only"
		}
	}

	catch (e) {
		return "hmmm... i couldn't understand that... try again";
	}
}

// QUESTIONS

function firstQuestions() {
	return [
		{
			type: "list",
			message: "what are you trying to do?",
			name: "intent",
			choices: [				
				{ name: "enumerate saved reports", value: "report" },
				{ name: "copy between projects", value: "copy" },
				{ name: "something else...", value: false }
			]
		}];
}

function standardQuestions(label = `SOURCE`, config = {}) {
	return [{
		type: "input",
		message: `${label} PROJECT: what is your project's ID?`,
		name: "project",
		validate: notEmpty,
		default: config.project || ""
	},
	{
		type: "input",
		message: `${label} PROJECT: what is your project's region?`,
		name: "region",
		default: "US"
	}];
}


function authQuestions(type, label, config = {}) {
	if (type === "service") {
		return [
			{
				type: "input",
				message: `${label} PROJECT: what is your service account user name?`,
				name: "acct",
				validate: notEmpty,
				default: config.acct || ""
			},
			{
				type: "input",
				message: `${label} PROJECT: what is your service account secret?`,
				name: "pass",
				validate: notEmpty,
				default: config.pass || ""
			}];
	}

	if (type === "bearer") {
		return [
			{
				type: "input",
				message: `${label} PROJECT: what is your bearer token?`,
				name: "bearer",
				validate: notEmpty,
				default: config.bearer || ""
			}
		];
	}

	//first question
	else {
		return [
			{
				type: "list",
				message: "how do you want to authenticate?",
				name: "auth",
				choices: [
					{ name: "service account", value: "service" },
					{ name: "bearer token", value: "bearer" }
				]
			}
		];
	}


}

function optionsQuestions(srcPid, destPid) {
	return [
		{
			type: "input",
			message: `copy specific boards(s) from project ${srcPid} to project ${destPid}?`,
			suffix: `\n\tenter comma separated list of board ids in project ${srcPid} (or leave blank to copy all boards)\n`,
			name: "dash_id",
			validate: dashCopyValidate
		},
		{
			type: "confirm",
			message: `do you want to copy all EVENTS from project ${srcPid} to project ${destPid}?`,
			name: "shouldCopyEvents",
			default: false
		},
		{
			type: "confirm",
			message: `do you want to copy all PROFILES from project ${srcPid} to project ${destPid}?`,
			name: "shouldCopyProfiles",
			default: false
		},
		{
			type: "confirm",
			message: `do you want to copy the SCHEMA (lexicon) from project ${srcPid} to project ${destPid}?`,
			name: "shouldCopySchema",
			default: false
		},
		{
			type: "confirm",
			message: `do you want to generate a log of everything that was done?`,
			name: "shouldGenerateSummary",
			default: true
		}
	];
}

function dateQuestions(srcPid) {
	return [
		{
			type: "input",
			message: `what is the start date for project ${srcPid}'s event export?`,
			suffix: "\nYYYY-MM-DD\n",
			name: "start",
			validate: notEmpty
		},
		{
			type: "input",
			message: `what is the end date for project ${srcPid}'s event export?`,
			suffix: "YYYY-MM-DD",
			name: "end",
			default: dayjs().format(dateFormat)
		},
	];
}

const hero = String.raw`
┌┬┐┌─┐  ┌┬┐┬┌─┐┬─┐┌─┐┌┬┐┌─┐
│││├─┘  │││││ ┬├┬┘├─┤ │ ├┤ 
┴ ┴┴    ┴ ┴┴└─┘┴└─┴ ┴ ┴ └─┘
`;

const banner = `\n\t(by AK) v${require('./package.json').version}

this script can COPY data (events + users) as well as saved entities (boards, reports, cohorts, custom event/props)\n\t ...from one project to another\n\n`;

const welcome = hero.concat(banner);

const whomp = String.raw`
¯\_(ツ)_/¯
`;

const letsgo = String.raw`ᕕ( ಠ‿ಠ)ᕗ`;
const cool = String.raw`( ͡° ͜ʖ ͡°)`;