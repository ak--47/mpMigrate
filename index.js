#! /usr/bin/env node

// THE GREAT MP REPORT MIGRATOR
// yes... you can move all your data, dashboards, reports, and custom entities to a new project with ease!
// read the docs. watch the video. plz.
// https://github.com/ak--47/mpMigrate
// 

require('dotenv').config();
const u = require('./utils.js');
let logs = ``;


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
    opts = {
        transformEventsFunc: x => x,
        transformProfilesFunc: x => x,
        isEU: false,
        shouldGenerateSummary: null,
        shouldCopyEvents: null,
        shouldCopyProfiles: null,
        shouldCopyEntities: null
    }) {

    log(`WELCOME TO THE GREAT MIXPANEL PROJECT MIGRATOR
		(by AK)

this script can COPY data (events + users) as well as saved entities (dashboard, reports, schemas, cohorts, custom event/props) from one project to another`)
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

    //options
    let generateSummary, copyEvents, copyProfiles, copyEntities;
    const { transformEventsFunc, transformProfilesFunc, isEU, shouldGenerateSummary, shouldCopyEvents, shouldCopyProfiles, shouldCopyEntities } = opts

    //PROMPT USER FOR OPTIONS (if not specified)
    if (shouldGenerateSummary === null || shouldCopyEvents === null || shouldCopyProfiles === null || shouldCopyEntities === null) {
        log(`first... i need to ask you a few questions...`)
            ({ generateSummary, copyEvents, copyProfiles, copyEntities } = await u.userPrompt(source, target))
    } else {
        generateSummary = shouldGenerateSummary
        copyEvents = shouldCopyEvents
        copyProfiles = shouldCopyProfiles
        copyEntities = shouldCopyEntities
    }

    time('migrate', 'start')

    //SOURCE
    //validate service account & get workspace id
    log(`validating source service account...`, null, true)
    let sourceWorkspace = await u.validateServiceAccount(source);
    source.workspace = sourceWorkspace.id
    let dataFolder = await u.makeProjectFolder(sourceWorkspace)
    source.localPath = dataFolder
    source = { ...sourceWorkspace, ...source }
    log(`	... 👍 looks good`)

    let numEvents, numProfiles, sourceSchema, sourceCustEvents, sourceCustProps, sourceCohorts, sourceDashes, sourceFoundReports, sourceEmptyDashes;

    // get all events
    if (copyEvents || generateSummary) {
        log(`querying project for events since ${source.start}`, null, true)
        numEvents = await u.getProjCount(source, `events`);
        log(`	... 👍 found ${u.comma(numEvents)} events`)
    }

    // get all users
    if (copyProfiles || generateSummary) {
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
        sourceCustEvents = await u.getCustomEvents(source)
        log(`	... 👍 found ${u.comma(sourceCustEvents.length)} custom events`)

        log(`fetching custom props for project: ${source.project}...`, null, true)
        sourceCustProps = await u.getCustomProps(source)
        log(`	... 👍 found ${u.comma(sourceCustProps.length)} custom props`)

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
        sourceFoundReports = 0
        for (const [index, dash] of sourceDashes.entries()) {
            let dashReports = await u.getDashReports(source, dash.id)
            sourceFoundReports += Object.keys(dashReports).length

            //store report metadata for later
            sourceDashes[index].SAVED_REPORTS = dashReports;

        }
        log(`	... 👍 found ${u.comma(sourceFoundReports)} reports`)

        //filter out empty dashboards
        log(`checking for empty dashboards...`, null, true)
        sourceEmptyDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length === 0);
        log(`	... found ${u.comma(sourceEmptyDashes.length)} dashboards ${sourceEmptyDashes.length > 0 ? '(these will NOT be copied)': ''}`)
        sourceDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length > 0)
    }

    if (generateSummary) {
        log(`stashing entity metadata in ${dataFolder}`, null, true)
        await u.saveLocalSummary({ sourceSchema, customEvents: sourceCustEvents, customProps: sourceCustProps, sourceCohorts, sourceDashes, sourceWorkspace, source, numEvents, numProfiles })
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
${u.comma(sourceCustEvents.length)} custom events
${u.comma(sourceCustProps.length)} custom props
${u.comma(sourceCohorts.length)} cohorts
${u.comma(sourceDashes.length)} dashboards
${u.comma(sourceFoundReports)} reports`
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

    let sourceExportEvents, targetImportEvents, sourceExportProfiles, targetImportProfiles, targetSchema, targetCustEvents, targetCustProps, targetCohorts, targetDashes;

    if (copyEvents) {
        log(`downloading ${u.comma(numEvents)} events...`, null, true)
        try {
            sourceExportEvents = await u.exportAllEvents(source)
            targetImportEvents = await u.sendEvents(source, target, transformEventsFunc)
            log(`sent ${u.comma(targetImportEvents.results.totalRecordCount)} events in ${u.comma(targetImportEvents.results.totalReqs)} requests; writing logfile...`)
            await u.writeFile(`${dataFolder}/eventLog.json`, JSON.stringify(targetImportEvents.responses, null, 2))
        } catch (e) {
            debugger;
        }

    }

    if (copyProfiles) {
        log(`downloading ${u.comma(numProfiles)} profiles...`, null, true)

        try {
            sourceExportProfiles = await u.exportAllProfiles(source, target)
            targetImportProfiles = await u.sendProfiles(source, target, transformProfilesFunc)
            log(`sent ${u.comma(numProfiles)} requests in ${u.comma(targetImportProfiles.responses.length)} requests; writing logfile...`)
            await u.writeFile(`${dataFolder}/profileLog.json`, JSON.stringify(targetImportProfiles.responses, null, 2))
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
            log(`creating ${sourceCustEvents.length} custom events + ${sourceCustProps.length} custom props...`, null, true);
            if (sourceCustProps.length > 0) targetCustProps = await u.makeCustomProps(target, sourceCustProps);
			if (sourceCustEvents.length > 0) targetCustEvents = await u.makeCustomEvents(target, sourceCustEvents, sourceCustProps, targetCustProps);            
            log(`	... 👍 done`)

            log(`creating ${sourceCohorts.length} cohorts...`, null, true);
            targetCohorts = await u.makeCohorts(source, target, sourceCohorts, sourceCustEvents, sourceCustProps, targetCustEvents, targetCustProps);
            log(`	... 👍 created ${u.comma(targetCohorts.length)} cohorts`)

            //TODO: propagate new entity Ids to reports from custom events/props
            log(`creating ${sourceDashes.length} dashboards & ${sourceFoundReports} reports...`, null, true);
            targetDashes = await u.makeDashes(source, target, sourceDashes, sourceCustEvents, sourceCustProps, sourceCohorts, targetCustEvents, targetCustProps, targetCohorts);
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
        sourceExportEvents,
        sourceExportProfiles,
        targetImportEvents,
        targetImportProfiles
    };

    log(`all finished... thank you for playing the game`)
    time(`migrate`, `stop`)
    //write logs
    await u.writeFile(`${dataFolder}/log.txt`, logs)

    return everyThingTheScriptDid
}


function log(message, data, hasResponse = false) {

    if (message) {
        console.log(message);
        logs += `${message}`
        if (!hasResponse) {
            console.log('\n');
            logs += `\n`
        }
    }

    if (data) {
        console.log('\n')
        console.log(JSON.stringify(data, null, 2))
        logs += `${JSON.stringify(data, null, 2)}`
        console.log('\n')
    }
}

function time(label = `foo`, directive = `start`) {
    if (directive === `start`) {
        console.time(label)
    } else if (directive === `stop`) {
        console.timeEnd(label)
    }

}


module.exports = main;