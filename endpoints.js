function me() {
	return `https://mixpanel.com/api/app/me`
}

function getAllDash(workSpaceId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/`
}

function getSingleDash(workSpaceId, dashId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}`
}

function getSingleReport(workSpaceId, reportId) {
	return `https://mixpanel.com/api/app/workspaces/${workSpaceId}/bookmarks/${reportId}?v=2`
}

function getSchemas(projectId) {
	return `https://mixpanel.com/api/app/projects/${projectId}/schemas`
}

module.exports = {
	me,
	getAllDash,
	getSingleDash,
	getSingleReport,
	getSchemas
}