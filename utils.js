const URLs = require('./endpoints.js')
const fetch = require('axios').default;
const FormData = require('form-data');

exports.validateServiceAccount = async function (creds) {
    let { acct: username, pass: password, project } = creds
    let res = (await fetch(URLs.me(), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR VALIDATING SERVICE ACCOUNT!`)
        console.error(e.message)
        process.exit(1)
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
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING COHORT`)
        console.error(e.message)
        process.exit(1)
    })).data

    return res.results
}

exports.getAllDash = async function (creds) {
    let { acct: username, pass: password, workspace } = creds
    let res = (await fetch(URLs.getAllDash(workspace), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING DASH`)
        console.error(e.message)
        process.exit(1)
    })).data

    return res.results
}

exports.getDashReports = async function (creds, dashId) {
    let { acct: username, pass: password, workspace } = creds
    let res = (await fetch(URLs.getSingleDash(workspace, dashId), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING REPORT`)
        console.error(e.message)
        process.exit(1)
    })).data

    return res.results.contents.report
}

exports.getSchema = async function (creds) {
    let { acct: username, pass: password, project } = creds
    let res = (await fetch(URLs.getSchemas(project), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING SCHEMA!`)
        console.error(e.message)
        process.exit(1)
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
        params;
        console.error(`ERROR POSTING SCHEMA!`)
        console.error(e.message)
        process.exit(1)
    })

    return res.data.results
}

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
            cohort;
            debugger;
            console.error(`ERROR CREATING COHORT!`)
            console.error(e.message)
            return {}
        });

        results.push(createdCohort);

    }

    return results;
}

//TODO DEAL WITH CUSTOM PROPS AS FILTERS!
exports.makeDashes = async function (creds, dashes = []) {
    let { acct: username, pass: password, project, workspace } = creds
    let results = {
        dashes: [],
        reports: [],
        shares: [],
        pins: []
    };

    loopDash: for (const dash of dashes) {
        let failed = false;
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

        //get rid of null keys
        for (let key in dash) {
            if (dash[key] === null) {
                delete dash[key]
            }
        }

        //for every dash to have a desc
        if (!dash.description) {
            dash.description = dash.title
        }

        //defaultPublic
        dash.global_access_type = "on"

        //make the dashboard; get back id
        let createdDash = await fetch(URLs.makeDash(workspace), {
            method: `post`,
            auth: { username, password },
            data: dash

        }).catch((e) => {
            //breaks on custom prop filters
            failed = true
            dash;
            results;
            debugger;
            console.error(`ERROR MAKING DASH! ${dash.title}`)
            console.error(e.message)
            return {}

        });
        results.dashes.push(createdDash);
        if (failed) {
            continue loopDash;
        }
        //use dash id to make reports
        const dashId = createdDash.data.results.id;
        creds.dashId = dashId
        const createdReports = await makeReports(creds, reports);
        results.reports.push(createdReports)

        //update shares
        let sharePayload = { "id": dashId, "projectShares": [{ "id": project, "canEdit": true }] };
        let sharedDash = await fetch(URLs.shareDash(project, dashId), {
            method: `post`,
            auth: { username, password },
            data: sharePayload
        }).catch((e) => {
            sharePayload;
            debugger;
            console.error(`ERROR SHARING DASH!`)
            console.error(e.message)
        })

        results.shares.push(sharedDash);

        //pin dashboards
        let pinnedDash = await fetch(URLs.pinDash(workspace, dashId), {
            method: `post`,
            auth: { username, password },
            data: {}
        }).catch((e) => {
            debugger;
        })

        results.pins.push(pinnedDash);

    }

    results.reports = results.reports.flat()
    return results
}

exports.getCustomEvents = async function (creds) {
    let { acct: username, pass: password, project, workspace } = creds
    let res = (await fetch(URLs.customEvents(workspace), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING CUSTOM EVENTS!`)
        console.error(e.message)
    })).data

    return res.custom_events

}
// BROKEN
exports.makeCustomEvents = async function (creds, custEvents) {
    let { acct: username, pass: password, project, workspace } = creds
    let results = [];
    loopCustomEvents: for (const custEvent of custEvents) {
        let failed = false;

		//custom events must be posted as forms?!?
		//why?
		let custPayload = new FormData();
		custPayload.append('name', custEvent.name);
		custPayload.append('alternatives', JSON.stringify(custEvent.alternatives));
		let formHeaders = custPayload.getHeaders();
		
		
        //get back id
        let createdCustEvent = await fetch(URLs.customEvents(workspace), {
            method: `post`,
            auth: { username, password },
			headers: {
				...formHeaders,
			  },
            data: custPayload

        }).catch((e) => {
            failed = true
            custEvent;
            debugger;
            console.error(`ERROR MAKING DASH! ${dash.title}`)
            console.error(e.message)
            return {}

        });
        results.push(createdCustEvent);
        
		//two outcomes
		if (failed) {
            continue loopCustomEvents;
        } else {
            // //share custom event
            // await fetch(URLs.shareCustEvent(project, createdCustEvent.id), {
            //     method: 'post',
            //     auth: { username, password },
            //     data: { "id": createdCustEvent.id, "projectShares": [{ "id": project, "canEdit": true }] }
            // })
        }
    }

    return results
}

exports.getCustomProps = async function (creds) {
    let { acct: username, pass: password, project, workspace } = creds
    let res = (await fetch(URLs.customProps(workspace), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING CUSTOM PROPS!`)
        console.error(e.message)
        process.exit(1)
    })).data

    return res.results

}
exports.makeCustomProps = async function (creds, custProps) {
    let { acct: username, pass: password, project, workspace } = creds
    let results = [];
    loopCustomProps: for (const custProp of custProps) {
        let failed = false;
        //get rid of disallowed keys       
        delete custProp.user
        delete custProp.created
        delete custProp.customPropertyId
        delete custProp.allow_staff_override
        delete custProp.can_share
        delete custProp.can_update_basic
        delete custProp.can_view
        delete custProp.canUpdateBasic
        delete custProp.modified
        delete custProp.referencedBy
        delete custProp.referencedDirectlyBy
        delete custProp.referencedRawEventProperties
		delete custProp.project

        //get rid of null keys
        for (let key in custProp) {
            if (custProp[key] === null) {
                delete custProp[key]
            }
        }

        //defaultPublic
        custProp.global_access_type = "on"

        //make the dashboard; get back id
        let createdCustProp = await fetch(URLs.customProps(workspace), {
            method: `post`,
            auth: { username, password },
            data: custProp

        }).catch((e) => {
            failed = true
            custProp;
            debugger;
            console.error(`ERROR MAKING DASH! ${dash.title}`)
            console.error(e.message)
            return {}

        });
        results.push(createdCustProp.data.results);
        if (failed) {
            continue loopCustomProps;
        }
    }

    return results
}

exports.getCustomProps = async function (creds) {
    let { acct: username, pass: password, project, workspace } = creds
    let res = (await fetch(URLs.customProps(workspace), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING CUSTOM PROPS!`)
        console.error(e.message)
        process.exit(1)
    })).data

    return res.results


}

const makeReports = async function (creds, reports = []) {
    let { acct: username, pass: password, project, workspace, dashId } = creds
    let results = [];
    loopReports: for (const report of reports) {
        let failed = false;
        //TODO match cohort id on params for reports with cohorts

        //put the report on the right dashboard
        report.dashboard_id = dashId
        //get rid of disallowed keys
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

        //null values make mixpanel unhappy; delete them too
        for (let key in report) {
            if (report[key] === null) {
                delete report[key]
            }
        }

        //unsure why? ... but you gotta do it.
        report.params = JSON.stringify(report.params)

        let createdReport = await fetch(URLs.makeReport(workspace), {
            method: `post`,
            auth: { username, password },
            data: report

        }).catch((e) => {
            //todo; figure out 500s
            failed = true;
            report;
            results;
            debugger;
            console.error(`ERROR CREATING REPORT!`)
            console.error(e.message)
            return {}
        });
        results.push(createdReport);
        if (failed) {
            continue loopReports;
        }
    }


    return results;
}