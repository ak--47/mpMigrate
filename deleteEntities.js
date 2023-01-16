// this tool is used for testing + deleting stuff
// be careful with this; it deletes all saved entities in a project
const u = require('./utils.js')
const URLs = require('./endpoints.js')
const fetch = require('axios').default;
const cli = require('./cli')
const types = require('./types.js');

/**
 * project delete!
 * @example
 * const { entityDelete } = require('mp-migrate')
 * const deletion = await entityDelete(target)
 * @param {types.Target} target `{acct, pass, bearer, project, region}`
 * @returns {Promise<Object>} Summary Data of Deletion
 */
async function main(target = {
    acct: "",
    pass: "",
    project: 1234,
	region: `US`
}) {
	require('dotenv').config({override: true});
    log(`👾 DELETE ALL ENTITIES 👾`)

	const { envCredsTarget } = cli.getEnvCreds()

    //choose creds based on .env or params
    if (target.acct === '' && target.pass === '') {
        target = envCredsTarget
        log(`using .env for target credentials`)
    }
	buildAuth(target)
    //SOURCE
    //validate service account & get workspace id
    log(`validating source service account...`, null, true)
    let targetWorkspace = await u.validateServiceAccount(target);
    target.workspace = targetWorkspace.id
    log(`	... 👍 looks good`)

    //get the events schema
    log(`fetching schema for project: ${target.project}...`, null, true)
    let targetSchema = await u.getSchema(target)
    log(`	... 👍 found schema with ${targetSchema.length} entries`)

    //custom events + props
    log(`fetching custom events for project: ${target.project}...`, null, true)
    let customEvents = await u.getCustomEvents(target)
    log(`	... 👍 found ${customEvents.length} custom events`)

    log(`fetching custom props for project: ${target.project}...`, null, true)
    let customProps = await u.getCustomProps(target)
    log(`	... 👍 found ${customProps.length} custom props`)

    //get cohorts
    log(`querying cohort metadata...`, null, true)
    let targetCohorts = await u.getCohorts(target);
    log(`	... 👍 ${targetCohorts.length} cohorts`)

    //get metadata for all dashboards
    log(`querying dashboards metadata...`, null, true)
    let targetDashes = await u.getAllDash(target)
    log(`	... 👍 found ${targetDashes.length} dashboards`)

    //deletion starts!
    log(`\ni will now delete:\n
	${targetSchema.length} events & props metadata
	${targetCohorts.length} cohorts
	${targetDashes.length} dashboards (and all child reports)
	${customEvents.length} custom events
	${customProps.length} customProps

for project: ${target.project}	

`)

    let { auth, project, workspace, region } = target

    //delete schema
    log(`deleting schema...`, null, true)
    let deletedSchema = await fetch(URLs.postSchema(project, region), {
        method: `delete`,
		// @ts-expect-error
        headers: { Authorization : auth}
    }).catch((e) => {
        debugger;
    })
    log(`... 👍 done`)

    log(`deleting custom events + props...`, null, true);
    for (const custEvent of customEvents) {
        await fetch(URLs.delCustEvent(workspace, region), {
            method: `delete`,
			// @ts-expect-error
            headers: { Authorization: auth},
            data: { "events": [{ "collectEverythingEventId": null, "customEventId": custEvent.id, "id": 0 }] }
        }).catch((e) => {
            custEvent
            debugger;
        })
    }

    for (const custProp of customProps) {
        await fetch(URLs.delCustProp(project, custProp.customPropertyId, region), {
            method: `delete`,
			// @ts-expect-error
			headers: { Authorization: auth},
        }).catch((e) => {
            custProp
            debugger;
        })
    }

	log(`... 👍 done`)


    //delete cohorts
    let deletedCohorts = [];
    if (targetCohorts.length > 0) {
        log(`deleting ${targetCohorts.length} cohorts...`, null, true)
        let cohortIds = targetCohorts.map(cohort => cohort.id);
        // @ts-ignore
        deletedCohorts = await fetch(URLs.deleteCohorts(project, region), {
            method: `post`,
			// @ts-expect-error
			headers: { Authorization: auth},
            data: { cohort_ids: cohortIds }
        }).catch((e) => {
            debugger;
        })
        log(`... 👍 done`)
    }


    //delete dashboards
    log(`deleting ${targetDashes.length} dashboards...`, null, true)
    let deletedDashboards = [];
    for (const dash of targetDashes) {
        let deletedDashboard = await fetch(URLs.getSingleDash(workspace, dash.id, region), {
            method: `delete`,
			// @ts-expect-error
			headers: { Authorization: auth}
        })
        deletedDashboards.push(deletedDashboard.data.results)
    }
    log(`... 👍 done`)

    log(`all finished!`)

    const everyThingTheScriptDid = {
        target,
        // @ts-ignore
        deletedSchema: deletedSchema.data.results,
        deletedCohorts,
        deletedDashboards
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

/**
 * 
 * @param {types.Source | types.Target} p 
 */
function buildAuth(p) {
	if (p.bearer) {
		p.auth = `Bearer ${p.bearer}`;
		return;
	}

	if (p.acct && p.pass) {
		p.auth = `Basic ${Buffer.from(p.acct + ":" + p.pass).toString('base64')}`;
		return;
	}

	console.error(`no bearer or service account for project ${p.project}`);
	throw Error('a bearer token token or service account is required!');

}


module.exports = main;