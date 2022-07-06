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


module.exports = {
	me,
	getAllDash,
	getSingleDash,
	getSingleReport
}