exports.me = function () {
    return `https://mixpanel.com/api/app/me`
}

exports.projectLink = function(project_id, workspace_id) {
	return `https://mixpanel.com/project/${project_id}/view/${workspace_id}/app/`
}

exports.getAllDash = function (workSpaceId) {
    return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/`
}

exports.getSingleDash = function (workSpaceId, dashId) {
    return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}`
}

exports.getSingleReport = function (workSpaceId, reportId) {
    return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/bookmarks/${reportId}?v=2`
}

exports.getSchemas = function (projectId) {
    return `https://mixpanel.com/api/app/projects/${projectId}/schemas`
}

exports.postSchema = function(projectId) {
	return `https://mixpanel.com/api/app/projects/${projectId}/schemas`
}

exports.makeDash = function(workSpaceId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/`
}

exports.makeReport =  function(workSpaceId, dashId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}`;
}


exports.shareDash = function(projectId, dashId) {
	return `https://mixpanel.com/api/app/projects/${projectId}/shared-entities/dashboards/${dashId}/upsert`
}

exports.pinDash = function(workSpaceId, dashId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}/pin/`
}

exports.getCohorts = function(workSpaceId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/cohorts/`
}

exports.makeCohorts = function(workSpaceId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/cohorts/`
}

exports.deleteCohorts = function(projectId) {
	return `https://mixpanel.com/api/app/projects/${projectId}/cohorts/bulk-delete/`
}

exports.customEvents = function(workSpaceId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/custom_events`
}

exports.delCustEvent = function(workspaceId) {
	return `https://mixpanel.com/api/app/workspaces/${workspaceId}/data-definitions/events`
}

exports.shareCustEvent = function(projectId, custEvId) {
	return `https://mixpanel.com/api/app/projects/${projectId}/shared-entities/custom-events/${custEvId}/upsert`
}

exports.customProps = function(workSpaceId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/custom_properties`
}

exports.delCustProp = function(projectId, custPropId) {
	return `https://mixpanel.com/api/app/projects/${projectId}/custom_properties/${custPropId}`
}

exports.getMetaData = function(projectId) {
	return `https://mixpanel.com/settings/project/${projectId}/metadata`
}

exports.getInsightsReport = function(projectId) {
	return `https://mixpanel.com/api/2.0/insights?project_id=${projectId}`
}

exports.dataExport = function(start, end) {
	return `https://data.mixpanel.com/api/2.0/export?from_date=${start}&to_date=${end}`
}

exports.profileExport = function(projectId) {
	return `https://mixpanel.com/api/2.0/engage?project_id=${projectId}`
}