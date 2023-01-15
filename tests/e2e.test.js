// @ts-nocheck
/* eslint-disable no-undef */
/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
/* cSpell:disable */

require('dotenv').config();
const { execSync } = require("child_process");
const { projectCopy } = require('../index.js');
const u = require('ak-tools');
const { getEnvCreds } = require('../cli.js');

let options = {
	transformEventsFunc: x => x,
	transformProfilesFunc: x => x,
	shouldGenerateSummary: false,
	shouldCopyEvents: false,
	shouldCopyProfiles: false,
	shouldCopyEntities: true,
	silent: false,
	skipPrompt: true,
};


beforeEach(() => {
	console.log('deleting entities...');
	execSync(`npm run delete`);
	console.log('...entities deleted 👍');
});

// describe('do tests work?', () => {
// 	test('a = a', () => {
// 		expect(true).toBe(true);
// 	});
// });

describe('module', () => {
	jest.setTimeout(600000)
	test('can run as module', async () => {		
		const {envCredsSource, envCredsTarget} = getEnvCreds()
		const result = await projectCopy(envCredsSource, envCredsTarget, options);
		const {sourceCohorts, sourceDashes, sourceSchema, targetCohorts, targetCustEvents, targetCustProps, targetDashes, targetSchema, targetReports} = result
		expect(sourceCohorts.length).toBe(2)
		expect(targetCohorts.length).toBe(2)
		
		expect(sourceDashes.length).toBe(3)
		expect(targetDashes.length).toBe(3)
		
		expect(sourceSchema.length).toBe(1)
		expect(targetSchema.added).toBe(1)
		
		expect(targetCustEvents.length).toBe(2)
		expect(targetCustProps.length).toBe(2)

		expect(targetReports.length).toBe(10)
		
	});
});


// describe('cli', () => {
// 	// test('events', async () => {
// 	// 	const output = execSync(`node ./index.js ${events} --fixData`).toString().trim().split('\n').pop();
// 	// 	const result = await u.load(output, true);
// 	// 	expect(result.success).toBe(5003);
// 	// });

// });

afterAll(() => {
	console.log('clearing logs...');
	execSync(`npm run prune`);
	console.log('...logs cleared 👍');
});