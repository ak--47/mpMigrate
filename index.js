#! /usr/bin/env node

// THE GREAT MP REPORT MIGRATOR
// yes... you can move all your dashboards + reports to a new project with ease!
// read the docs. plz.
// https://github.com/ak--47/mpMigrate

require('dotenv').config();
const u = require('./utils.js');



async function main(
    source = {
        acct: "",
        pass: "",
        project: 1234
    }, target = {
        acct: "",
        pass: "",
        project: 1234
    }) {

    log(`WELCOME TO THE GREAT MIXPANEL PROJECT MIGRATOR
		(by AK)

this script can COPY data (events + users) as well as saved entities (dashboard, reports, schemas, cohorts, custom event/props) from one project to another

first... i need to ask you a few questions...`)
    const { envCredsSource, envCredsTarget } = u.getEnvCreds()

    //choose creds based on .env or params
    if (source.acct === '' && source.pass === '') {
        source = envCredsSource
        log(`using .env for source credentials`)
    }

    if (target.acct === '' && target.pass === '') {
        target = envCredsTarget
        log(`using .env for target credentials`)
    }

    //PROMPT USER FOR INPUT
    const { generateSummary, copyEvents, copyProfiles, copyEntities } = await u.userPrompt(source, target)

    //SOURCE
    //validate service account & get workspace id
    log(`validating source service account...`, null, true)
    let sourceWorkspace = await u.validateServiceAccount(source);
    source.workspace = sourceWorkspace.id
    let dataFolder = await u.makeProjectFolder(sourceWorkspace)
    source.localPath = dataFolder
    log(`	... 👍 looks good`)

    // get all events
    log(`querying project for events`, null, true)
    let numEvents = await u.getProjCount(source, `events`);
    log(`	... 👍 found ${u.comma(numEvents)} events`)

    // get all users
    log(`querying project for users`, null, true)
    let numProfiles = await u.getProjCount(source, `profiles`)
    log(`	... 👍 found ${u.comma(numProfiles)} users`)

    //get the events schema
    log(`fetching schema for project: ${source.project}...`, null, true)
    let sourceSchema = await u.getSchema(source)
    log(`	... 👍 found schema with ${u.comma(sourceSchema.length)} entries`)

    //custom events + props
    log(`fetching custom events for project: ${source.project}...`, null, true)
    let customEvents = await u.getCustomEvents(source)
    log(`	... 👍 found ${u.comma(customEvents.length)} custom events`)

    log(`fetching custom props for project: ${source.project}...`, null, true)
    let customProps = await u.getCustomProps(source)
    log(`	... 👍 found ${u.comma(customProps.length)} custom props`)

    //get cohorts
    log(`querying cohort metadata...`, null, true)
    let sourceCohorts = await u.getCohorts(source);
    log(`	... 👍 ${u.comma(sourceCohorts.length)} cohorts`)

    //get metadata for all dashboards
    log(`querying dashboards metadata...`, null, true)
    let sourceDashes = await u.getAllDash(source)
    log(`	... 👍 found ${u.comma(sourceDashes.length)} dashboards`)

    //for each dashboard, get metadata for every child report
    log(`querying reports metadata...`, null, true)
    let foundReports = 0
    for (const [index, dash] of sourceDashes.entries()) {
        let dashReports = await u.getDashReports(source, dash.id)
        foundReports += Object.keys(dashReports).length

        //store report metadata for later
        sourceDashes[index].SAVED_REPORTS = dashReports;

    }
    log(`	... 👍 found ${u.comma(foundReports)} reports`)

    log(`i can save a summary of all these entities (as JSON) if you wish.`)
    //not used
    // const promptSchema = {
    //     properties: {
    //         pattern: /^(?:Yes|No|yes|no|y|n|Y|N)$/,
    //         required: true,
    //         message: 'please say "yes" or "no", or "y", or "n"'
    //     }
    // }
    // prompt.start();
    // prompt.message = `should i save a copy of the project's metadata?`;
    // await prompt.get(['y/n']);
    // const shouldSaveReports = prompt.history('y/n')?.value?.toLowerCase()

    // if (shouldSaveReports === 'y' || shouldSaveReports === 'yes') {
    //     log(`	... stashing metadata`)
    //     await u.saveLocalSummary({ sourceSchema, customEvents, customProps, sourceCohorts, sourceDashes, sourceWorkspace, source })
    // } else {
    //     log(`	... skipping`)
    // }

    //filter out empty dashboards
    log(`checking for empty dashboards...`, null, true)
    let emptyDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length === 0);
    log(`	... found ${u.comma(emptyDashes.length)} dashboards ${emptyDashes.length > 0 ? '(these will NOT be copied)': ''}`)
    sourceDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length > 0);

    //the migration starts
    log(`\ni will now copy:\n
	${u.comma(numEvents)} events
	${u.comma(numProfiles)} user profiles
	${u.comma(sourceSchema.length)} events & props schema
	${u.comma(customEvents.length)} custom events
	${u.comma(customProps.length)} custom props
	${u.comma(sourceCohorts.length)} cohorts
	${u.comma(sourceDashes.length)} dashboards
	${u.comma(foundReports)} reports

from project: ${source.project} to project: ${target.project}	

`)

    prompt.start();
    prompt.message = `this will create NEW reports in the target project. `;
    await prompt.get(['proceed? y/n?']);
    const shouldCopyReports = prompt.history('proceed? y/n?')?.value?.toLowerCase()

    if (shouldCopyReports === 'y' || shouldCopyReports === 'yes') {
        `proceed!` //no opp
    } else {
        log(`	... skipping copy; quitting`)
        process.exit(0)
    }
    prompt.stop()

    log(`\nPROCEEDING WITH COPY!\n`)

    //TARGET
    log(`validating target service account...`, null, true)
    let targetWorkspace = await u.validateServiceAccount(target);
    target.workspace = targetWorkspace.id
    log(`	... 👍 looks good`)

    log(`uploading existing lexicon schema to new project...`, null, true);
    let targetSchema = await u.postSchema(target, sourceSchema)
    log(`	... 👍 done`)

    //create custom events + props
    log(`creating ${customEvents.length} custom events + ${customProps.length} custom props...`, null, true);
    let targetCustEvents, targetCustProps
    // BROKEN
    if (customEvents.length > 0) targetCustEvents = await u.makeCustomEvents(target, customEvents);
    if (customProps.length > 0) targetCustProps = await u.makeCustomProps(target, customProps);
    log(`	... 👍 done`)

    log(`creating ${sourceCohorts.length} cohorts...`, null, true);
    let targetCohorts = await u.makeCohorts(target, sourceCohorts);
    log(`	... 👍 created ${u.comma(targetCohorts.length)} cohorts`)

    //TODO: propagate new entity Ids to reports from custom events/props
    log(`creating ${sourceDashes.length} dashboards & ${foundReports} reports...`, null, true);
    let targetDashes = await u.makeDashes(target, sourceDashes);
    log(`	... 👍 created ${u.comma(targetDashes.dashes.length)} dashboards\n	... 👍 created ${targetDashes.reports.length} reports`)

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
        targetDashes: targetDashes.dashes,
        targetReports: targetDashes.reports,


    };

    return everyThingTheScriptDid
}


function log(message, data, hasResponse = false) {
    if (message) {
        console.log(message);
        if (!hasResponse) {
            console.log('\n');
        }
    }

    if (data) {
        console.log('\n')
        console.log(JSON.stringify(data, null, 2))
        console.log('\n')
    }
}

module.exports = main;