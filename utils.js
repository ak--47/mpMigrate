const URLs = require('./endpoints.js')
const fetch = require('axios').default;
const FormData = require('form-data');
const fs = require('fs').promises;
const makeDir = require('fs').mkdirSync
const { pick } = require('underscore');
const { omitBy, isEmpty, pickBy } = require('lodash')
const dayjs = require('dayjs')


// AUTH
exports.getEnvCreds = function () {
    //sweep .env to pickup creds
    const envVarsSource = pick(process.env, `SOURCE_ACCT`, `SOURCE_PASS`, `SOURCE_PROJECT`)
    const envVarsTarget = pick(process.env, `TARGET_ACCT`, `TARGET_PASS`, `TARGET_PROJECT`)
    const sourceKeyNames = { SOURCE_ACCT: "acct", SOURCE_PASS: "pass", SOURCE_PROJECT: "project" }
    const targetKeyNames = { TARGET_ACCT: "acct", TARGET_PASS: "pass", TARGET_PROJECT: "project" }
    const envCredsSource = renameKeys(envVarsSource, sourceKeyNames)
    const envCredsTarget = renameKeys(envVarsTarget, targetKeyNames)

    return {
        envCredsSource,
        envCredsTarget
    }

}

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

    //workspace metadata does not contain project name
    globalView[0].projName = res.results.projects[project].name
    globalView[0].projId = project

    return globalView[0];
}

// GETTERS
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

exports.getCustomEvents = async function (creds) {
    let { acct: username, pass: password, project, workspace } = creds
    let res = (await fetch(URLs.customEvents(workspace), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR GETTING CUSTOM EVENTS!`)
        console.error(e.message)
    }))?.data

    return res.custom_events

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

// SETTERS
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

//TODO DEAL WITH CUSTOM PROPS + COHORTS AS FILTERS FOR EVERYTHINGS
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

        //get rid of disallowed keys (this is backwards; u shuld whitelist)
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
        delete dash.can_pin_dashboards

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
            console.error(`ERROR MAKING CUST EVENT!\n${JSON.stringify(custEvent), null, 2}`)
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
            console.error(`ERROR MAKING CUSTOM PROP!\n${JSON.stringify(custProp, null, 2)}`)
            console.error(e.message)
            return {}

        });
        results.push(createdCustProp?.data?.results);
        if (failed) {
            continue loopCustomProps;
        }
    }

    return results
}

exports.saveLocalCopy = async function (projectMetaData) {
    const { sourceSchema: schema, customEvents, customProps, sourceCohorts: cohorts, sourceDashes: dashes, sourceWorkspace: workspace } = projectMetaData

    //make a folder for the data
    try {
        makeDir(`./savedProjects/${workspace.projName}`);
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }

    const summary = await makeSummary({ schema, customEvents, customProps, cohorts, dashes, workspace })
    debugger;
}

// LOCAL UTILS

const removeNulls = function (obj) {
    function isObject(val) {
        if (val === null) { return false; }
        return ((typeof val === 'function') || (typeof val === 'object'));
    }

    const isArray = obj instanceof Array;

    for (var k in obj) {
        // falsy values
        if (!Boolean(obj[k])) {
            isArray ? obj.splice(k, 1) : delete obj[k]
        }

        // empty arrays
        if (Array.isArray(obj[k]) && obj[k]?.length === 0) {
            delete obj[k]
        }

        // empty objects
        if (isObject(obj[k])) {
            if (JSON.stringify(obj[k]) === '{}') {
                delete obj[k]
            }
        }

        // recursion
        if (isObject(obj[k])) {
            removeNulls(obj[k])
        }
    }
}

const makeReports = async function (creds, reports = []) {
    let { acct: username, pass: password, project, workspace, dashId } = creds
    let results = [];
    loopReports: for (const report of reports) {
        let failed = false;
        //TODO match cohort id + custom events/props on params for reports with cohorts

        //put the report on the right dashboard
        // report.dashboard_id = dashId
        report.global_access_type = "off"

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

        const payload = {
            "content": {
                "action": "create",
                "content_type": "report",
                "content_params": {
                    "bookmark": report
                }
            }
        }

        let createdReport = await fetch(URLs.makeReport(workspace, dashId), {
            method: `patch`,
            auth: { username, password },
            data: payload

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

//https://stackoverflow.com/a/45287523
const renameKeys = function (obj, newKeys) {
    const keyValues = Object.keys(obj).map(key => {
        const newKey = newKeys[key] || key
        return {
            [newKey]: obj[key]
        }
    })
    return Object.assign({}, ...keyValues)
}


const writeFile = async function (filename, data) {
    await fs.writeFile(filename, data);
}

// SUMMARIES
const makeSummary = async function (projectMetaData) {
    try {
        const { schema, customEvents, customProps, cohorts, dashes, workspace } = projectMetaData
        let title = `METADATA FOR PROJECT ${workspace.projId}\n\t${workspace.projName} (workspace ${workspace.id} : ${workspace.name})\n`
        title += `\tcollected at ${dayjs().format('MM-DD-YYYY @ hh:MM A')}\n\n`
        const schemaSummary = makeSchemaSummary(schema);
        const customEventSummary = makeCustomEventSummary(customEvents);
        const customPropSummary = makeCustomPropSummary(customProps);
        const cohortSummary = makeCohortSummary(cohorts);
        const dashSummary = makeDashSummary(dashes);
        const fullSummary = title + schemaSummary + customEventSummary + customPropSummary + dashSummary + cohortSummary
        await writeFile(`./savedProjects/${workspace.projName}/fullSummary.txt`, fullSummary);
        // todo write to file!
        debugger;
        return true;
    } catch (e) {
        debugger;
        return false;
    }
}

const makeSchemaSummary = function (schema) {
    const title = ``
    const events = schema.filter(x => x.entityType === 'event')
    const profiles = schema.filter(x => x.entityType === 'profile')
    const eventSummary = events.map(meta => `\t${meta.name}\t\t\t${meta.schemaJson.description}`).join('\n')
    const profileSummary = profiles.map(meta => `\t${Object.keys(meta.schemaJson.properties).join(', ')}`).join(', ')
    return `EVENTS:
${eventSummary}

PROFILE PROPS:
${profileSummary}
\n\n`
}

const makeCustomEventSummary = function (customEvents) {
    const summary = customEvents.map((custEvent) => {
        return `\t${custEvent.name} (${custEvent.id}) = ${custEvent.alternatives.map((logic)=>{
			return `${logic.event}`}).join(' | ')}`
    }).join('\n')


    return `
CUSTOM EVENTS:
${summary}
\n\n`
}

const makeCustomPropSummary = function (customProps) {
    const summary = customProps.map((prop) => {
        let formula = prop.displayFormula;
        let variables = Object.entries(prop.composedProperties)
        for (const formulae of variables) {
            formula = formula.replace(formulae[0], `**${formulae[1].value}**`)
        }
        return `\t${prop.name} (${prop.customPropertyId})\t\t${prop.description}
${formula}\n`
    }).join('\n')
    return `CUSTOM PROPS:
${summary}
\n\n`
}

const makeCohortSummary = function (cohorts) {
    const summary = cohorts.map((cohort) => {
        let cohortLogic;
        try {
            cohortLogic = JSON.parse(JSON.stringify(cohort.groups));
            removeNulls(cohortLogic)
        } catch (e) {
            cohortLogic = `could not resolve cohort operators (cohort was likely created from a report)`
        }
        return `\t${cohort.name} (${cohort.id})\t\t${cohort.description} (created by: ${cohort.created_by.email})
${JSON.stringify(cohortLogic, null, 2)}\n`
    }).join('\n')
    return `COHORTS:
${summary}\n\n`
}

const makeDashSummary = function (dashes) {
    dashes = dashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length > 0);
    const summary = dashes.map((dash) => {
        return `\tDASH "${dash.title}" (${dash.id})\n\t${dash.description} (created by: ${dash.creator_email})

${makeReportSummaries(dash.SAVED_REPORTS)}`
    }).join('\n')
    return `DASHBOARDS\n
${summary}
\n\n`
}

const makeReportSummaries = function (reports) {
    let summary = ``;
    let savedReports = [];
    let reportIds = Object.keys(reports)
    for (const reportId of reportIds) {
        savedReports.push(reports[reportId])
    }
    for (const report of savedReports) {
        let reportLogic;
        try {
			if (report.type === `insights`) reportLogic = report.params.sections
			if (report.type === `funnels`) repoortLogic = report.params.steps
			if (report.type === `retention`) repoortLogic = report.params
			if (report.type === `flows`) repoortLogic = reports.params.steps
            reportLogic = JSON.parse(JSON.stringify(reportLogic))
            removeNulls(reportLogic)
        } catch (e) {
            reportLogic = `could not resolve report logic`
        }
        summary += `\t\t\tREPORT: ${report.name} (${report.id} ${report.type.toUpperCase()})\n\t\t\t${report.description} (created by: ${report.creator_email})\n`
        summary += `${JSON.stringify(reportLogic, null, 2)}`
        summary += `\n\n`
    }

    return summary
}