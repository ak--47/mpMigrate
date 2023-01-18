// @ts-nocheck
/* eslint-disable no-undef */
/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
/* cSpell:disable */

require('dotenv').config();
const { execSync } = require("child_process");
const mpMigrate = require('../index.js');
const u = require('ak-tools');
const { getEnvCreds } = require('../cli.js');

let options = {
	transformEventsFunc: x => x,
	transformProfilesFunc: x => x,
	shouldGenerateSummary: false,
	shouldCopyEvents: false,
	shouldCopyProfiles: false,
	shouldCopyEntities: true,
	shouldCopySchema: true,
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
		const result = await mpMigrate(envCredsSource, envCredsTarget, options);
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

describe('dashes', () => {
	jest.setTimeout(600000)
	test('properly copies a single dash', async () => {		
		const {envCredsSource, envCredsTarget} = getEnvCreds()
		envCredsSource.dash_id = [3657621]
		const result = await mpMigrate(envCredsSource, envCredsTarget, options);
		const {sourceCohorts, sourceDashes, sourceSchema, targetCohorts, targetCustEvents, targetCustProps, targetDashes, targetSchema, targetReports} = result
		expect(sourceCohorts.length).toBe(0)
		expect(targetCohorts.length).toBe(0)
		
		expect(sourceDashes.length).toBe(1)
		expect(targetDashes.length).toBe(1)
		
		expect(sourceSchema.length).toBe(1)
		expect(targetSchema.added).toBe(1)		
		expect(targetCustEvents).toBe(undefined)
		
		expect(targetCustProps.length).toBe(1)

		expect(targetReports.length).toBe(6)
		
	});
});


afterAll(() => {
	// console.log('TEST FINISHED deleting entities...');
	// execSync(`npm run delete`);
	// console.log('...entities deleted 👍');
	console.log('clearing logs...');
	execSync(`npm run prune`);
	console.log('...logs cleared 👍');
});