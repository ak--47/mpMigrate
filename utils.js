const URLs = require('./endpoints.js')
const fetch = require('axios').default;
const FormData = require('form-data');
const fs = require('fs').promises;
const { createWriteStream } = require('fs')
const makeDir = require('fs').mkdirSync
const { pick } = require('underscore');
const dayjs = require('dayjs')
const path = require('path')
const dateFormat = `YYYY-MM-DD`
const mpImport = require('mixpanel-import')
const prompt = require('prompt');
const stream = require('stream');
const { URLSearchParams } = require('url')
const qs = require('qs')


// AUTH
exports.getEnvCreds = function () {
    //sweep .env to pickup creds
    const envVarsSource = pick(process.env, `SOURCE_ACCT`, `SOURCE_PASS`, `SOURCE_PROJECT`, `SOURCE_DATE`)
    const envVarsTarget = pick(process.env, `TARGET_ACCT`, `TARGET_PASS`, `TARGET_PROJECT`)
    const sourceKeyNames = { SOURCE_ACCT: "acct", SOURCE_PASS: "pass", SOURCE_PROJECT: "project", SOURCE_DATE: "start" }
    const targetKeyNames = { TARGET_ACCT: "acct", TARGET_PASS: "pass", TARGET_PROJECT: "project" }
    const envCredsSource = renameKeys(envVarsSource, sourceKeyNames)
    const envCredsTarget = renameKeys(envVarsTarget, targetKeyNames)

    if (dayjs(envCredsSource.start).isValid()) {
        envCredsSource.start = dayjs(envCredsSource.start).format(dateFormat)
    }

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

    // get project metadata
    let metaData = (await fetch(URLs.getMetaData(project), {
        auth: { username, password }
    }).catch((e) => {
        creds;
        debugger;
        console.error(`ERROR FETCHING METADATA!`)
        console.error(e.message)
        process.exit(1)
    })).data.results

    globalView[0].api_key = metaData.api_key
    globalView[0].secret = metaData.secret
    globalView[0].token = metaData.token

    return globalView[0];
}

exports.makeProjectFolder = async function (workspace) {
    //make a folder for the data
    let folderPath = `./savedProjects/${workspace.projName} (${workspace.projId})`
    try {
        makeDir(`./savedProjects/`)
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }
    try {
        makeDir(folderPath);
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }

    try {
        makeDir(path.resolve(`${folderPath}/exports`))
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }

    try {
        makeDir(path.resolve(`${folderPath}/exports/profiles`))
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err;
        }
    }

    return path.resolve(folderPath)
}

// USER PROMPTS
exports.userPrompt = async function (source, target, shouldContinue) {
    //user input
    const yesNoRegex = /^(?:Yes|No|yes|no|y|n|Y|N)$/
    const defaults = {
        pattern: yesNoRegex,
        type: 'string',
        required: true,
        message: 'please say "yes" or "no", or "y", or "n"',
        default: 'no',
        before: function (value) { return value?.toLowerCase() }
    }

    if (shouldContinue) {
        const continueSchema = {
            properties: {
                shouldContinue: {
                    description: `are you sure you want to continue?`,
                    ...defaults
                }
            }
        }

        continueSchema.properties.shouldContinue.default = 'yes'

        prompt.start();
        prompt.message = ``
        let { shouldContinue } = await prompt.get(continueSchema);

        if (shouldContinue.includes('y')) {
            return true
        } else {
            return false
        }


    }

    const promptSchema = {
        properties: {
            generateSummary: {
                description: `do you want to generate a summary of project ${source.project}'s saved entities?`,
                ...defaults
            },
            copyEvents: {
                description: `do you want to copy events from project ${source.project} to project ${target.project}?`,
                ...defaults
            },
            copyProfiles: {
                description: `do you want to copy profiles from project ${source.project} to project ${target.project}?`,
                ...defaults
            },
            copyEntities: {
                description: `do you want to copy saved entities from project ${source.project} to project ${target.project}?`,
                ...defaults
            }
        }
    }
    prompt.start();
    prompt.message = ``
    let { generateSummary, copyEvents, copyProfiles, copyEntities } = await prompt.get(promptSchema);

    if (generateSummary.includes('y')) {
        generateSummary = true
    } else {
        generateSummary = false
    }

    if (copyEvents.includes('y')) {
        copyEvents = true
    } else {
        copyEvents = false
    }

    if (copyProfiles.includes('y')) {
        copyProfiles = true
    } else {
        copyProfiles = false
    }

    if (copyEntities.includes('y')) {
        copyEntities = true
    } else {
        copyEntities = false
    }

    console.log(``)

    return {
        generateSummary,
        copyEvents,
        copyProfiles,
        copyEntities
    }



}

exports.continue = async function () {

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
    let res = (await fetch(URLs.getCustomEvents(workspace), {
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
    let res = (await fetch(URLs.getCustomProps(workspace), {
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
exports.makeCohorts = async function (sourceCreds, targetCreds, cohorts = [], sourceCustEvents = [], sourceCustProps = [], targetCustEvents = [], targetCustProps = []) {
    let { acct: username, pass: password, workspace } = targetCreds
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

exports.makeDashes = async function (sourceCreds, targetCreds, dashes = [], sourceCustEvents = [], sourceCustProps = [], sourceCohorts = [], targetCustEvents = [], targetCustProps = [], targetCohorts = []) {
    let { acct: username, pass: password, project, workspace } = targetCreds
    let results = {
        dashes: [],
        reports: [],
        shares: [],
        pins: []
    };

    //match old and new custom entities
    let sourceEntities = { custEvents: sourceCustEvents, custProps: sourceCustProps, cohorts: sourceCohorts }
    let targetEntities = { custEvents: targetCustEvents, custProps: targetCustProps, cohorts: targetCohorts }
    let matchedEntities = await matchCustomEntities(sourceCreds, sourceEntities, targetEntities)

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
        const createdReports = await makeReports(creds, reports, targetCustEvents, targetCustProps, targetCohorts);
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
        let createdCustProp = await fetch(URLs.createCustomProp(workspace), {
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

// BROKEN
exports.makeCustomEvents = async function (creds, custEvents) {
    let { acct: username, pass: password, project, workspace } = creds
    let results = [];
    loopCustomEvents: for (const custEvent of custEvents) {
        let failed = false;
        const { name, alternatives } = custEvent

        //custom events must be posted as forms?!?
        //why?
		let body = `alternatives=${encodeURIComponent(JSON.stringify(custEvent.alternatives))}&name=${encodeURIComponent(custEvent.name)}`
        
		let custPayload = new FormData();
        custPayload.append('alternatives', JSON.stringify(custEvent.alternatives));
        custPayload.append('name', custEvent.name);
        let headers = custPayload.getHeaders();
        		
		let altBody = qs.stringify({alternatives, name})
        const params = new URLSearchParams({ name, alternatives: JSON.stringify(alternatives) }).toString();

		let payload = {name, alternatives }


        //get back id - BORKED
        let createdCustEvent = await fetch(URLs.createCustomEvent(workspace), {
            method: 'post',
			headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            auth: { username, password },
            data: qs.stringify(payload),
			maxRedirects: 1

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
            //share custom event
            // await fetch(URLs.shareCustEvent(project, createdCustEvent.id), {
            //     method: 'post',
            //     auth: { username, password },
            //     data: { "id": createdCustEvent.id, "projectShares": [{ "id": project, "canEdit": true }] }
            // })
        }
    }

    return results
}

exports.saveLocalSummary = async function (projectMetaData) {
    const { sourceSchema: schema, customEvents, customProps, sourceCohorts: cohorts, sourceDashes: dashes, sourceWorkspace: workspace, source, numEvents, numProfiles } = projectMetaData
    const summary = await makeSummary({ schema, customEvents, customProps, cohorts, dashes, workspace, numEvents, numProfiles });
    const writeSummary = await writeFile(path.resolve(`${source.localPath}/fullSummary.txt`), summary)
    const writeSchema = await writeFile(path.resolve(`${source.localPath}/schema.json`), json(schema))
    const writeCustomEvents = await writeFile(path.resolve(`${source.localPath}/customEvents.json`), json(customEvents))
    const writeCustomProps = await writeFile(path.resolve(`${source.localPath}/customProps.json`), json(customProps))
    const writeCohorts = await writeFile(path.resolve(`${source.localPath}/cohorts.json`), json(cohorts))
    const writeDashes = await writeFile(path.resolve(`${source.localPath}/dashboards.json`), json(dashes))
}


// SUMMARIES
const makeSummary = async function (projectMetaData) {
    try {
        const { schema, customEvents, customProps, cohorts, dashes, workspace, numEvents, numProfiles } = projectMetaData
        let title = `METADATA FOR PROJECT ${workspace.projId}\n\t${workspace.projName} (workspace ${workspace.id} : ${workspace.name})\n`
        title += `\tcollected at ${dayjs().format('MM-DD-YYYY @ hh:MM A')}\n\n`
        title += `EVENTS: ${exports.comma(numEvents)}\nPROFILES: ${exports.comma(numProfiles)}\n\n`
        const schemaSummary = makeSchemaSummary(schema);
        const customEventSummary = makeCustomEventSummary(customEvents);
        const customPropSummary = makeCustomPropSummary(customProps);
        const cohortSummary = makeCohortSummary(cohorts);
        const dashSummary = makeDashSummary(dashes);
        const fullSummary = title + schemaSummary + customEventSummary + customPropSummary + dashSummary + cohortSummary
        return fullSummary;
    } catch (e) {
        debugger;
        return false;
    }
}

const makeSchemaSummary = function (schema) {
    const title = ``
    const events = schema.filter(x => x.entityType === 'event')
    const profiles = schema.filter(x => x.entityType === 'profile')
    const eventSummary = events.map(meta => `\t• ${meta.name}\t\t\t${meta.schemaJson.description}`).join('\n')
    const profileSummary = profiles.map(meta => `\t• ${Object.keys(meta.schemaJson.properties).join(', ')}`).join(', ')
    return `EVENTS:
${eventSummary}

PROFILE PROPS:
${profileSummary}
\n\n`
}

const makeCustomEventSummary = function (customEvents) {
    const summary = customEvents.map((custEvent) => {
        return `\t• ${custEvent.name} (${custEvent.id}) = ${custEvent.alternatives.map((logic)=>{
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
        return `\t• ${prop.name} (${prop.customPropertyId})\t\t${prop.description}
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
        return `\t• ${cohort.name} (${cohort.id})\t\t${cohort.description} (created by: ${cohort.created_by.email})
${JSON.stringify(cohortLogic, null, 2)}\n`
    }).join('\n')
    return `COHORTS:
${summary}\n\n`
}

const makeDashSummary = function (dashes) {
    dashes = dashes.filter(dash => Object.keys(dash.SAVED_REPORTS).length > 0);
    const summary = dashes.map((dash) => {
        return `\t• DASH "${dash.title}" (${dash.id})\n\t${dash.description} (created by: ${dash.creator_email})

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
            if (report.type === `funnels`) reportLogic = report.params.steps
            if (report.type === `retention`) reportLogic = report.params
            if (report.type === `flows`) reportLogic = report.params.steps
            reportLogic = clone(reportLogic)
            removeNulls(reportLogic)
        } catch (e) {
            reportLogic = `could not resolve report logic`
        }
        summary += `\t\t\t→ REPORT: ${report.name} (${report.id} ${report.type.toUpperCase()})\n\t\t\t${report.description} (created by: ${report.creator_email})\n`
        summary += `${JSON.stringify(reportLogic, null, 2)}`
        summary += `\n\n`
    }

    return summary
}

// QUERY
exports.getProjCount = async function (source, type) {
    const startDate = dayjs(source.start).format(dateFormat)
    const endDate = dayjs().format(dateFormat);
    let payload;
    if (type === `events`) {
        payload = {
            "tracking_props": {
                "is_main_query_for_report": true,
                "report_name": "insights",
                "has_unsaved_changes": true,
                "query_reason": "qb_other_update"
            },
            "bookmark": {
                "sections": {
                    "show": [{
                        "dataset": "$mixpanel",
                        "value": {
                            "name": "$all_events",
                            "resourceType": "events"
                        },
                        "resourceType": "events",
                        "profileType": null,
                        "search": "",
                        "dataGroupId": null,
                        "math": "total",
                        "perUserAggregation": null,
                        "property": null
                    }],
                    "cohorts": [],
                    "group": [],
                    "filter": [],
                    "formula": [],
                    "time": [{
                        "dateRangeType": "between",
                        "unit": "day",
                        "value": [startDate, endDate]
                    }]
                },
                "columnWidths": {
                    "bar": {}
                },
                "displayOptions": {
                    "chartType": "bar",
                    "plotStyle": "standard",
                    "analysis": "linear",
                    "value": "absolute"
                },
                "sorting": {
                    "bar": {
                        "sortBy": "column",
                        "colSortAttrs": [{
                            "sortBy": "value",
                            "sortOrder": "desc"
                        }]
                    },
                    "line": {
                        "sortBy": "value",
                        "sortOrder": "desc",
                        "valueField": "averageValue",
                        "colSortAttrs": []
                    },
                    "table": {
                        "sortBy": "column",
                        "colSortAttrs": [{
                            "sortBy": "label",
                            "sortOrder": "asc"
                        }]
                    },
                    "insights-metric": {
                        "sortBy": "value",
                        "sortOrder": "desc",
                        "valueField": "totalValue",
                        "colSortAttrs": []
                    },
                    "pie": {
                        "sortBy": "value",
                        "sortOrder": "desc",
                        "valueField": "totalValue",
                        "colSortAttrs": []
                    }
                }
            },
            "queryLimits": {
                "limit": 10000
            },
            "use_query_cache": true,
            "use_query_sampling": false
        }
    } else if (type === `profiles`) {
        payload = {
            "tracking_props": {
                "is_main_query_for_report": true,
                "report_name": "insights",
                "has_unsaved_changes": true,
                "query_reason": "nav_from_other_report"
            },
            "bookmark": {
                "sections": {
                    "show": [{
                        "dataset": null,
                        "value": { "name": "$all_people", "resourceType": "people" },
                        "resourceType": "people",
                        "profileType": "people",
                        "search": "",
                        "dataGroupId": null,
                        "math": "total",
                        "perUserAggregation": null,
                        "property": null
                    }],
                    "cohorts": [],
                    "group": [],
                    "filter": [],
                    "formula": [],
                    "time": [{ "unit": "day", "value": 30 }]
                },
                "columnWidths": { "bar": {} },
                "displayOptions": { "chartType": "bar", "plotStyle": "standard", "analysis": "linear", "value": "absolute" },
                "sorting": { "bar": { "sortBy": "column", "colSortAttrs": [{ "sortBy": "value", "sortOrder": "desc" }] }, "line": { "sortBy": "value", "sortOrder": "desc", "valueField": "averageValue", "colSortAttrs": [] }, "table": { "sortBy": "column", "colSortAttrs": [{ "sortBy": "label", "sortOrder": "asc" }] }, "insights-metric": { "sortBy": "value", "sortOrder": "desc", "valueField": "totalValue", "colSortAttrs": [] }, "pie": { "sortBy": "value", "sortOrder": "desc", "valueField": "totalValue", "colSortAttrs": [] } }
            },
            "queryLimits": { "limit": 3000 },
            "use_query_cache": true,
            "use_query_sampling": false
        }
    } else {
        console.error(`only supported query types are "events" or "profiles"`)
        process.exit(1)
    }

    const opts = {
        method: 'POST',
        url: URLs.getInsightsReport(source.project),
        headers: {
            Accept: 'application/json'

        },
        auth: {
            username: source.acct,
            password: source.pass
        },
        data: payload
    }

    let resTotal;

    try {
        resTotal = await fetch(opts);
        if (type === `events`) {
            return resTotal.data.series["All Events - Total"].all
        } else if (type === `profiles`) {
            return resTotal.data.series["All User Profiles - Total"].value
        }

    } catch (e) {
        debugger;
    }



}

exports.getProfileCount = async function (source) {

}


// EXPORT
exports.exportAllEvents = async function (source) {
    const startDate = dayjs(source.start).format(dateFormat)
    const endDate = dayjs().format(dateFormat);
    const url = URLs.dataExport(startDate, endDate)
    const file = path.resolve(`${source.localPath}/exports/events.ndjson`)
    const writer = createWriteStream(file);
    const auth = Buffer.from(source.secret + '::').toString('base64')
    const response = await fetch({
        method: 'GET',
        url,
        headers: {
            Authorization: `Basic ${auth}`
        },
        responseType: 'stream'
    });

    response.data.pipe(writer);

    // TODO: why can't i pass the fileName to resolve()
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
    })

}

exports.exportAllProfiles = async function (source, target) {
    const auth = Buffer.from(source.secret + '::').toString('base64')
    let iterations = 0;
    let fileName = `people-${iterations}.json`
    let folder = path.resolve(`${source.localPath}/exports/profiles/`)
    let file = path.resolve(`${folder}/${fileName}`)
    let response = (await fetch({
        method: 'POST',
        url: URLs.profileExport(source.projId),
        headers: {
            Authorization: `Basic ${auth}`
        },
    })).data

    let { page, page_size, session_id, total } = response
    let lastNumResults = response.results.length
    let profiles = response.results.map(function (person) {
        return {
            "$token": target.token,
            "$distinct_id": person.$distinct_id,
            "$ignore_time": true,
            "$ip": 0,
            "$set": {
                ...person.$properties
            }
        }
    });
    // write first page of profiles
    await writeFile(file, JSON.stringify(profiles))

    const encodedParams = new URLSearchParams();

    // recursively consume all profiles
    // https://developer.mixpanel.com/reference/engage-query
    while (lastNumResults >= page_size) {
        page++
        iterations++

        fileName = `people-${iterations}.json`
        file = path.resolve(`${folder}/${fileName}`)

        encodedParams.set('page', page);
        encodedParams.set('session_id', session_id);

        response = (await fetch({
            method: 'POST',
            url: URLs.profileExport(source.projId),
            headers: {
                Authorization: `Basic ${auth}`
            },
            data: encodedParams
        })).data


        profiles = response.results.map(function (person) {
            return {
                "$token": target.token,
                "$distinct_id": person.$distinct_id,
                "$ignore_time": true,
                "$ip": 0,
                "$set": {
                    ...person.$properties
                }
            }
        });
        await writeFile(file, JSON.stringify(profiles))

        // update recursion
        lastNumResults = response.results.length;


    }

    return folder;

}

// INGESTION
// https://github.com/ak--47/mixpanel-import#credentials
exports.sendEvents = async function (source, target, transform) {
    const data = path.resolve(`${source.localPath}/exports/events.ndjson`)
    const creds = {
        acct: target.acct,
        pass: target.pass,
        project: target.project,
        token: target.token
    }

    const options = {
        recordType: `event`, //event, user, OR group
        streamSize: 27, // highWaterMark for streaming chunks (2^27 ~= 134MB)
        region: `US`, //US or EU
        recordsPerBatch: 2000, //max # of records in each batch
        bytesPerBatch: 2 * 1024 * 1024, //max # of bytes in each batch
        strict: true, //use strict mode?
        logs: true, //print to stdout?
        transformFunc: transform
    }
    const importedData = await mpImport(creds, data, options);

    return importedData
}

exports.sendProfiles = async function (source, target, transform) {
    const data = path.resolve(`${source.localPath}/exports/profiles/`)
    const creds = {
        acct: target.acct,
        pass: target.pass,
        project: target.project,
        token: target.token
    }

    const options = {
        recordType: `user`, //event, user, OR group
        streamSize: 27, // highWaterMark for streaming chunks (2^27 ~= 134MB)
        region: `US`, //US or EU
        recordsPerBatch: 1000, //max # of records in each batch
        logs: true, //print to stdout?
        transformFunc: transform
    }
    const importedData = await mpImport(creds, data, options);

    return importedData
}

// MISC
exports.comma = function (x) {
    try {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    } catch (e) {
        return x
    }
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

const makeReports = async function (creds, reports = [], targetCustEvents, targetCustProps, targetCohorts) {
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


const matchCustomEntities = async function (sourceCreds, sourceEntities, targetEntities) {
    const { projId, workspace, acct, pass } = sourceCreds
    let sourceCohortList = await fetch(URLs.listCohorts(projId, workspace), {
        method: `POST`,
        auth: { username: acct, password: pass }
    })

    //TODO MATCH UP SOURCE COHRTS + IDs
    debugger;


    let template = {
        name: ``,
        sourceId: ``,
        targetId: ``,
    }


    return {}
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

exports.writeFile = async function (filename, data) {
    await fs.writeFile(filename, data);
}

const json = function (data) {
    return JSON.stringify(data, null, 2)
}

// https://stackoverflow.com/a/41951007
const clone = function (thing, opts) {
    var newObject = {};
    if (thing instanceof Array) {
        return thing.map(function (i) { return clone(i, opts); });
    } else if (thing instanceof Date) {
        return new Date(thing);
    } else if (thing instanceof RegExp) {
        return new RegExp(thing);
    } else if (thing instanceof Function) {
        return opts && opts.newFns ?
            new Function('return ' + thing.toString())() :
            thing;
    } else if (thing instanceof Object) {
        Object.keys(thing).forEach(function (key) {
            newObject[key] = clone(thing[key], opts);
        });
        return newObject;
    } else if ([undefined, null].indexOf(thing) > -1) {
        return thing;
    } else {
        if (thing.constructor.name === 'Symbol') {
            return Symbol(thing.toString()
                .replace(/^Symbol\(/, '')
                .slice(0, -1));
        }
        // return _.clone(thing);  // If you must use _ ;)
        return thing.__proto__.constructor(thing);
    }
}