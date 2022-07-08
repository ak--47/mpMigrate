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

    //TODO support custom events + props; for now, filter them out of the schema
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

//TODO FOR ALL: set access permissions on saved entities
exports.makeCohorts = async function (creds, cohorts = []) {
    let { acct: username, pass: password, workspace } = creds
    let results = [];

    for (const cohort of cohorts) {
        //get rid of disallowed keys
        delete cohort.count
        delete cohort.created_by
        delete cohort.data_group_id
        delete cohort.id
        delete cohort.last_edited
        delete cohort.last_queried
        delete cohort.referenced_by
        delete cohort.referenced_directly_by
        delete cohort.active_integrations
        delete cohort.can_update_basic
        delete cohort.can_view
        delete cohort.allow_staff_override
        delete cohort.is_superadmin
        delete cohort.can_share

        let createdCohort = await fetch(URLs.makeCohorts(workspace), {
            method: `post`,
            auth: { username, password },
            data: cohort

        }).catch((e) => {
            debugger;
        });

        results.push(createdCohort);

    }

    return results;
}

exports.makeDashes = async function (creds, dashes = []) {
    let { acct: username, pass: password, project, workspace } = creds
    let results = {
        dashes: [],
        reports: []
    };

    for (const dash of dashes) {
        //copy all child reports metadatas
        let reports = [];
        for (let reportId in dash.SAVED_REPORTS) {
            reports.push(dash.SAVED_REPORTS[reportId])
        }

        //get rid of disallowed keys
        delete dash.SAVED_REPORTS;
        delete dash.id
        delete dash.is_private
        delete dash.creator
        delete dash.creator_id
        delete dash.creator_name
        delete dash.creator_email
        delete dash.is_restricted
        delete dash.modified
        delete dash.is_favorited
        delete dash.pinned_date
        delete dash.generation_type
        delete dash.layout_version
        delete dash.can_see_grid_chameleon
        delete dash.can_update_basic
        delete dash.can_view
        delete dash.allow_staff_override
        delete dash.is_superadmin
        delete dash.can_share

        //make the dashboard; get back id
        let createdDash = await fetch(URLs.makeDash(workspace), {
            method: `post`,
            auth: { username, password },
            data: dash

        }).catch((e) => {
            debugger;
        });
        results.dashes.push(createdDash);

        //use dash id to make reports
        const dashId = createdDash.data.results.id;
        creds.dashId = dashId
        const createdReports = await makeReports(creds, reports);
        results.reports = [...results.reports, ...createdReports];

    }

    return results
}


const makeReports = async function (creds, reports = []) {
    let { acct: username, pass: password, project, workspace, dashId } = creds
    let results = [];
    for (const report of reports) {
        //TODO match cohort id on params for reports with cohorts

        //change paramas we need to change
        report.dashboard_id = dashId
        //delete invalid params
        delete report.id
        delete report.project_id
        delete report.workspace_id
        delete report.original_type
        delete report.include_in_dashboard
        delete report.is_default
        delete report.creator
        delete report.creator_id
        delete report.creator_name
        delete report.creator_email
        delete report.generation_type
        delete report.created
        delete report.modified
        delete report.metadata
        delete report.dashboard
        delete report.is_visibility_restricted
        delete report.is_modification_restricted
        delete report.can_update_basic
        delete report.can_view
        delete report.can_share
        delete report.allow_staff_override
        delete report.is_superadmin

        //null values get a little wonky; so delete them
        for (let key in report) {
            if (report[key] === null) {
                delete report[key]
            }
        }

        //stringify params... unsure why?
        report.params = JSON.stringify(report.params)

        let createdReport = await fetch(URLs.makeReport(workspace), {
            method: `post`,
            auth: { username, password },
            data: report

        }).catch((e) => {
            //todo; figure out 500s
            debugger;
        });
        results.push(createdReport);
    }


    return results;
}