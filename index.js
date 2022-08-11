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
        project: 1234,
        start: `01-01-2022`
    },
    target = {
        acct: "",
        pass: "",
        project: 1234
    },
    transformFunc = x => x) {

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
    source = { ...sourceWorkspace, ...source }
    log(`	... 👍 looks good`)

    let numEvents, numProfiles, sourceSchema, customEvents, customProps, sourceCohorts, sourceDashes, foundReports, emptyDashes;

    // get all events
    if (copyEvents) {
        log(`querying project for events since ${source.start}`, null, true)
        numEvents = await u.getProjCount(source, `events`);
        log(`	... 👍 found ${u.comma(numEvents)} events`)
    }

    // get all users
    if (copyProfiles) {
        log(`querying project for users`, null, true)
        numProfiles = await u.getProjCount(source, `profiles`)
        log(`	... 👍 found ${u.comma(numProfiles)} users`)
    }

    if (generateSummary || copyEntities) {
        //get the events schema
        log(`fetching schema for project: ${source.project}...`, null, true)
        sourceSchema = await u.getSchema(source)
        log(`	... 👍 found schema with ${u.comma(sourceSchema.length)} entries`)

        //custom events + props
        log(`fetching custom events for project: ${source.project}...`, null, true)
        customEvents = await u.getCustomEvents(source)
        log(`	... 👍 found ${u.comma(customEvents.length)} custom events`)

        log(`fetching custom props for project: ${source.project}...`, null, true)
        customProps = await u.getCustomProps(source)
        log(`	... 👍 found ${u.comma(customProps.length)} custom props`)

        //get cohorts
        log(`querying cohort metadata...`, null, true)
        sourceCohorts = await u.getCohorts(source);
        log(`	... 👍 ${u.comma(sourceCohorts.length)} cohorts`)

        //get metadata for all dashboards
        log(`querying dashboards metadata...`, null, true)
        sourceDashes = await u.getAllDash(source)
        log(`	... 👍 found ${u.comma(sourceDashes.length)} dashboards`)

        //for each dashboard, get metadata for every child report
        log(`querying reports metadata...`, null, true)
        foundReports = 0
        for (const [index, dash] of sourceDashes.entries()) {
            let dashReports = await u.getDashReports(source, dash.id)
            foundReports += Object.keys(dashReports).length

            //store report metadata for later
            sourceDashes[index].SAVED_REPORTS = dashReports;

        }
        log(`	... 👍 found ${u.comma(foundReports)} reports`)

        //filter out empty dashboards
        log(`checking for empty dashboards...`, null, true)
        emptyDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length === 0);
        log(`	... found ${u.comma(emptyDashes.length)} dashboards ${emptyDashes.length > 0 ? '(these will NOT be copied)': ''}`)
        sourceDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length > 0)
    }

    if (generateSummary) {
        log(`stashing entity metadata in ${dataFolder}`, null, true)
        await u.saveLocalSummary({ sourceSchema, customEvents, customProps, sourceCohorts, sourceDashes, sourceWorkspace, source })
        log(`	... 👍 done`)
    }

    if (!copyEvents && !copyProfiles && !copyEntities) {
        log(`nothing else to do... quitting`)
        process.exit(0)
    }

    let intentString = ``;

    if (copyEvents) {
        intentString += `${u.comma(numEvents)} events\n`
    }

    if (copyProfiles) {
        intentString += `${u.comma(numProfiles)} user profiles\n`
    }

    if (copyEntities) {
        intentString += `${u.comma(sourceSchema.length)} events & props schema
${u.comma(customEvents.length)} custom events
${u.comma(customProps.length)} custom props
${u.comma(sourceCohorts.length)} cohorts
${u.comma(sourceDashes.length)} dashboards
${u.comma(foundReports)} reports`
    }



    //the migration starts
    log(`\ni will now copy:\n

${intentString}	

from project: ${source.project} to project: ${target.project}	

`)
    let shouldContinue = await u.userPrompt(null, null, true)

    if (!shouldContinue) {
        log(`aborting...`)
        process.exit(0)
    }

    if (!target.acct || !target.pass || !target.project) {
        log(`no target project specified, exiting...`)
        process.exit(0)
    }

    log(`\nPROCEEDING WITH COPY!\n`)

    //TARGET
    log(`validating target service account...`, null, true)
    let targetWorkspace = await u.validateServiceAccount(target);
    target.workspace = targetWorkspace.id
    target = { ...targetWorkspace, ...target }
    log(`	... 👍 looks good`)

    let targetImportEvents, targetImportProfiles, targetSchema, targetCustEvents, targetCustProps, targetCohorts, targetDashes;

    if (copyEvents) {
        log(`downloading ${u.comma(numEvents)} events...`)
        try {
            targetImportEvents = await u.exportAllEvents(source)
        } catch (e) {
            debugger;
        }

    }

    if (copyProfiles) {
        log(`downloading ${u.comma(numProfiles)} profiles...`)

        try {
            targetImportProfiles = await u.exportAllProfiles(source, target)
        } catch (e) {
            debugger;
        }

    }

    if (copyEntities) {
        try {
            log(`uploading existing lexicon schema to new project...`, null, true);
            targetSchema = await u.postSchema(target, sourceSchema)
            log(`	... 👍 done`)

            //create custom events + props
            log(`creating ${customEvents.length} custom events + ${customProps.length} custom props...`, null, true);
            // BROKEN
            if (customEvents.length > 0) targetCustEvents = await u.makeCustomEvents(target, customEvents);
            if (customProps.length > 0) targetCustProps = await u.makeCustomProps(target, customProps);
            log(`	... 👍 done`)

            log(`creating ${sourceCohorts.length} cohorts...`, null, true);
            targetCohorts = await u.makeCohorts(target, sourceCohorts);
            log(`	... 👍 created ${u.comma(targetCohorts.length)} cohorts`)

            //TODO: propagate new entity Ids to reports from custom events/props
            log(`creating ${sourceDashes.length} dashboards & ${foundReports} reports...`, null, true);
            targetDashes = await u.makeDashes(target, sourceDashes);
            log(`	... 👍 created ${u.comma(targetDashes.dashes.length)} dashboards\n	... 👍 created ${targetDashes.reports.length} reports`)
        } catch (e) {
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
        targetImportEvents,
        targetImportProfiles


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