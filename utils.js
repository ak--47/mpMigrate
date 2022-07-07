const URLs = require('./endpoints.js')
const fetch = require('axios').default;

exports.validateServiceAccount = async function (creds) {
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

exports.getCohorts = async function (creds) {
    let { acct: username, pass: password, workspace } = creds
    let res = (await fetch(URLs.getCohorts(workspace), {
        auth: { username, password }
    })).data

    return res.results
}

exports.getAllDash = async function (creds) {
    let { acct: username, pass: password, workspace } = creds
    let res = (await fetch(URLs.getAllDash(workspace), {
        auth: { username, password }
    })).data

    return res.results
}

exports.getDashReports = async function (creds, dashId) {
    let { acct: username, pass: password, workspace } = creds
    let res = (await fetch(URLs.getSingleDash(workspace, dashId), {
        auth: { username, password }
    })).data

    return res.results.contents.report
}

exports.getSchema = async function (creds) {
    let { acct: username, pass: password, project } = creds
    let res = (await fetch(URLs.getSchemas(project), {
        auth: { username, password }
    })).data

    return res.results

}

exports.postSchema = async function (creds, schema) {
    let { acct: username, pass: password, project } = creds

    //todo support custom events + props; for now, filter them out of the schema
    schema = schema.filter(e => !e.entityType.includes('custom'))

    //remove "unknown" types by iterating through properties; they are not allowed by the API
    schema.forEach((singSchema, index) => {
        for (let prop in singSchema.schemaJson.properties) {
            if (singSchema.schemaJson.properties[prop].type === "unknown") {
                delete schema[index].schemaJson.properties[prop].type
            }
        }
    })

    let extraParams = { "truncate": true }
    let params = { entries: schema, ...extraParams }
    let res = await fetch(URLs.postSchema(project), {
        method: `post`,
        auth: { username, password },
        data: params

    }).catch((e) => {
		console.error(`ERROR POSTING SCHEMA!`)
		console.error(e.message)
		process.exit(1)
    })

	return res.data.results
}