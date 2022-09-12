exports.me = function (region = `US`) {
    return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/me`
}

exports.projectLink = function(project_id, workspace_id, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/project/${project_id}/view/${workspace_id}/app/`
}

exports.getAllDash = function (workSpaceId, region = `US`) {
    return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/`
}

exports.getSingleDash = function (workSpaceId, dashId, region = `US`) {
    return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}`
}

exports.getSingleReport = function (workSpaceId, reportId, region = `US`) {
    return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/bookmarks/${reportId}?v=2`
}

exports.getSchemas = function (projectId, region = `US`) {
    return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/schemas`
}

exports.postSchema = function(projectId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/schemas`
}

exports.makeDash = function(workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/`
}

exports.makeReport =  function(workSpaceId, dashId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}`;
}


exports.shareDash = function(projectId, dashId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/shared-entities/dashboards/${dashId}/upsert`
}

exports.pinDash = function(workSpaceId, dashId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}/pin/`
}

exports.getCohorts = function(workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/cohorts/`
}

exports.makeCohorts = function(workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/cohorts/`
}

exports.shareCohort = function(projectId, cohortId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/shared-entities/cohorts/${cohortId}/upsert`
}

exports.deleteCohorts = function(projectId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/cohorts/bulk-delete/`
}

exports.createCustomEvent = function(workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_events/`
}



exports.getCustomEvents = function(workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_events`
}


exports.delCustEvent = function(workspaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workspaceId}/data-definitions/events`
}

exports.shareCustEvent = function(projectId, custEvId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/shared-entities/custom-events/${custEvId}/upsert`
}

exports.shareCustProp = function(projectId, custPropId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/shared-entities/custom-properties/${custPropId}/upsert`
}

exports.createCustomProp = function(workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_properties`
}

exports.getCustomProps = function(workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_properties`
}

exports.dataDefinitions = function(resourceType, workSpaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/workspaces/${workSpaceId}/data-definitions/properties?resourceType=${resourceType}&includeCustom=true`
}

exports.delCustProp = function(projectId, custPropId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/app/projects/${projectId}/custom_properties/${custPropId}`
}

exports.getMetaData = function(projectId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/settings/project/${projectId}/metadata`
}

exports.getInsightsReport = function(projectId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/2.0/insights?project_id=${projectId}`
}

exports.dataExport = function(start, end, region = `US`) {
	return `https://data.${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/2.0/export?from_date=${start}&to_date=${end}`
}

exports.profileExport = function(projectId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/2.0/engage?project_id=${projectId}`
}

exports.listCohorts = function(projectId, workspaceId, region = `US`) {
	return `https://${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/2.0/cohorts/list?project_id=${projectId}&workspace_id=${workspaceId}`
}