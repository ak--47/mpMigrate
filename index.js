// THE GREAT MP REPORT MIGRATOR
// yes... you can move all your dashboards + reports to a new project with ease!
// read the docs. plz.
const prompt = require('prompt');
const u = require('./utils.js')
// const URLs = require('./endpoints.js');



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

    log(`WELCOME TO THE GREAT REPORT MIGRATOR (by AK)\ni can migrate mixpanel saved entities (dashboard, reports, schemas, and cohorts) from one project to another (very quickly)`)
    log(`validating source service account...`, null, true)

    //SOURCE

    //validate service account & get workspace id
    let sourceWorkspace = await u.validateServiceAccount(source);
    source.workspace = sourceWorkspace
    log(`... 👍 looks good`)

    //get the events schema
    log(`fetching schema for project: ${source.project}...`, null, true)
    let sourceSchema = await u.getSchema(source)
    log(`... 👍 found schema with ${sourceSchema.length} entries`)

    //get cohorts
    log(`querying cohort metadata...`, null, true)
    let sourceCohorts = await u.getCohorts(source);
    log(`... 👍 ${sourceCohorts.length} cohorts`)

    //get metadata for all dashboards
    log(`querying dashboards metadata...`, null, true)
    let sourceDashes = await u.getAllDash(source)
    log(`... 👍 found ${sourceDashes.length} dashboards`)

    //for each dashboard, get metadata for every child report
    log(`querying reports metdata...`, null, true)
    let foundReports = 0
    for (const [index, dash] of sourceDashes.entries()) {
        let dashReports = await u.getDashReports(source, dash.id)
        foundReports += Object.keys(dashReports).length

        //store report metadata for later
        sourceDashes[index].SAVED_REPORTS = dashReports;

    }
    log(`... 👍 found ${foundReports} reports`)

	//filter out empty dashboards
	log(`checking for empty dashboards...`, null, true)
	let emptyDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length === 0);
	log(`... found ${emptyDashes.length} dashboards ${emptyDashes.length > 0 ? '(these will NOT be copied)': ''}`)
	sourceDashes = sourceDashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length > 0);

    //the migration starts
    log(`\ni will now migrate:\n
	${sourceSchema.length} events & props metadata
	${sourceCohorts.length} cohorts
	${sourceDashes.length} dashboards
	${foundReports} reports

from project: ${source.project} to project: ${target.project}	

this action is IRREVERSIBLE. are you SURE you want to continue? y/n
`)

    // confirm with user
    // https://www.npmjs.com/package/prompt
    // prompt.start();
    // const {go} = await prompt.get(['go']);

    //TARGET

    log(`validating target service account...`, null, true)
    //validate service account & get workspace id
    let targetWorkspace = await u.validateServiceAccount(target);
    target.workspace = targetWorkspace
    log(`	... 👍 looks good`)

    log(`uploading existing lexicon schema to new project...`, null, true);
    let targetSchema = await u.postSchema(target, sourceSchema)
    log(`	... 👍 done`)

    log(`creating ${sourceCohorts.length} cohorts...`, null, true);
    let targetCohorts = await u.makeCohorts(target, sourceCohorts);
    log(`	... 👍 created ${targetCohorts.length} cohorts`)
    
    log(`creating ${sourceDashes.length} dashboards & ${foundReports} reports...`, null, true);
    let targetDashes = await u.makeDashes(target, sourceDashes);    
    log(`	... 👍 created ${targetDashes.dashes.length} dashboards\n	... 👍 created ${targetDashes.reports.length} reports`)

	const everyThingTheScriptDid = {
        source,
        target,
        sourceSchema,
        sourceCohorts,
        sourceDashes,
        targetSchema,
        targetCohorts,
        targetDashes: targetDashes.dashes,
        targetReports: targetDashes.reports

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