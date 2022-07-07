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

    log(`STARTING REPORT MIGRATIOR`)
    log(`validating source service account...`, null, true)
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
    log(`querying reports medata...`, null, true)
    let foundReports = 0
    for (const [index, dash] of sourceDashes.entries()) {
        let dashReports = await u.getDashReports(source, dash.id)
        foundReports += Object.keys(dashReports).length

        //store report metadata for later
        sourceDashes[index].SAVED_REPORTS = dashReports;

    }
    log(`... 👍 found ${foundReports} reports`)

    //the migration starts
    log(`\ni will now migrate:\n
	${sourceSchema.length} events & props metadata
	${sourceDashes.length} dashboards
	${foundReports} reports

from project: ${source.project} to project: ${target.project}	

are you sure you want to continue? y/n
`)

    log(`validating target service account...`, null, true)
    //validate service account & get workspace id
    let targetWorkspace = await u.validateServiceAccount(target);
    target.workspace = targetWorkspace
    log(`... 👍 looks good`)

    log(`uploading existing lexicon schema to new project...`, null, true);
	let updateTargetSchema = await u.postSchema(target, sourceSchema)
	log(`... 👍 done`)

    // confirm with user
    // https://www.npmjs.com/package/prompt
    // prompt.start();
    // const {go} = await prompt.get(['go']);
    return 42;
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