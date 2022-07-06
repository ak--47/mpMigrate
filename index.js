// THE GREAT MP REPORT MIGRATOR
// yes... you can move all your dashboards + reports to a new project with ease!
// read the docs. plz.
const URLs = require('./endpoints.js');
const fetch = require('axios').default;


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
    //validate service account & get workspace id
    let workspace = await validateServiceAccount(source);
    source.workspace = workspace
	log(`validating service account... 👍`)

    //get metadata for all dashboards
	log(`querying dashboards...`)
    let dashes = await getAllDash(source)
	log(`...found ${dashes.length} dashboards 👍`)

	//for each dashboard, get metadata for every report
	log(`querying reports...`)
	let foundReports = 0
	for (const [index, dash] of dashes.entries()) {
		let dashReports = await getDashReports(source, dash.id)
		foundReports += Object.keys(dashReports).length
		
		//store report metadata for later
		dashes[index].SAVED_REPORTS = dashReports;
		
	}
	log(`...found ${foundReports} reports 👍`)



    return 42;
}

async function validateServiceAccount(creds) {
    let { acct: username, pass: password, project } = creds
    let res = (await fetch(URLs.me(), {
        auth: { username, password }
    })).data

    //can this users access the supplied project
    if (res.results.projects[project]) {
        `pass: access`
    } else {
        `fail: access`
        console.error(`user: ${username} does not have access to project: ${project}\ndouble check your credentials and try again`);
        process.exit(1)

    }

    //ensure account is admin or higher
    let perms = res.results.projects[project].role.name.toLowerCase();
    if (['admin', 'owner'].some(x => x === perms)) {
        `pass: permissions`
    } else {
        `fail: permissions`
        console.error(`user: ${username} has ${perms} to project ${project}\nthis script requires accounts to have 'admin' or 'ower' permissions\nupdate your permissions and try again`);
        process.exit(1)

    }

    //find the global workspace id of the project
    let workspaces = [];
    for (let workSpaceId in res.results.workspaces) {
        workspaces.push(res.results.workspaces[workSpaceId])
    }

    let globalView = workspaces.filter(x => x.project_id === project && x.is_global);

    if (globalView.length > 0) {
        `pass: global access`
    } else {
        `fail: global access`
        console.error(`user: ${username} does not have access to a global data view in ${project}\nthis script requires accounts to have access to a global data view\nupdate your permissions and try again`);
        process.exit(1)
    }

    return globalView[0].id;
}

async function getAllDash(creds) {
    let { acct: username, pass: password, workspace } = creds
    let res = (await fetch(URLs.getAllDash(workspace), {
        auth: { username, password }
    })).data

    return res.results
}

async function getDashReports(creds, dashId) {
	let { acct: username, pass: password, workspace } = creds
    let res = (await fetch(URLs.getSingleDash(workspace, dashId), {
        auth: { username, password }
    })).data

    return res.results.contents.report
}

function log(message, data) {
    if (message) {
        console.log(message);
		console.log('\n');
    }

    if (data) {
        console.log('\n')
        console.log(JSON.stringify(data, null, 2))
        console.log('\n')
    }
}

module.exports = main;