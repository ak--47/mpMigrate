function me() {
	return `https://mixpanel.com/api/app/me`
}

function allDash(pid) {
	return `https://mixpanel.com/api/app/workspaces/${pid}/dashboards/`
}

function singleDash(pid, dashId) {
	return `https://mixpanel.com/api/app/workspaces/${pid}/dashboards/${dashId}`
}

function singleReport(pid, reportId) {
	return `https://mixpanel.com/api/app/workspaces/${pid}/bookmarks/${reportId}?v=2`
}


module.exports = {
	me,
	allDash,
	singleDash,
	singleReport
}