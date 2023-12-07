exports.me = function (region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/me`;
};

exports.projectLink = function (project_id, workspace_id, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/project/${project_id}/view/${workspace_id}/app/`;
};

exports.getAllDash = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/`;
};

exports.getSingleDash = function (workSpaceId, dashId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}`;
};

exports.getSingleReport = function (workSpaceId, reportId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/bookmarks/${reportId}?v=2`;
};

exports.getSchemas = function (projectId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/schemas`;
};

exports.postSchema = function (projectId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/schemas`;
};

exports.makeDash = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/`;
};

exports.makeReport = function (workSpaceId, dashId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}`;
};

exports.shareDash = function (projectId, dashId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/shared-entities/dashboards/${dashId}/upsert`;
};

exports.pinDash = function (workSpaceId, dashId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/dashboards/${dashId}/pin/`;
};

exports.getCohorts = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/cohorts/`;
};

exports.makeCohorts = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/cohorts/`;
};

exports.shareCohort = function (projectId, cohortId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/shared-entities/cohorts/${cohortId}/upsert`;
};

exports.deleteCohorts = function (projectId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/cohorts/bulk-delete/`;
};

exports.createCustomEvent = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_events/`;
};



exports.getCustomEvents = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_events`;
};


exports.delCustEvent = function (workspaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workspaceId}/data-definitions/events`;
};

exports.shareCustEvent = function (projectId, custEvId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/shared-entities/custom-events/${custEvId}/upsert`;
};

exports.shareCustProp = function (projectId, custPropId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/shared-entities/custom-properties/${custPropId}/upsert`;
};

exports.createCustomProp = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_properties`;
};

exports.getCustomProps = function (workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/custom_properties`;
};

exports.dataDefinitions = function (resourceType, workSpaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/workspaces/${workSpaceId}/data-definitions/properties?resourceType=${resourceType}&includeCustom=true`;
};

exports.delCustProp = function (projectId, custPropId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/app/projects/${projectId}/custom_properties/${custPropId}`;
};

exports.getMetaData = function (projectId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/settings/project/${projectId}/metadata`;
};

exports.getInsightsReport = function (projectId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/2.0/insights?project_id=${projectId}`;
};

exports.dataExport = function (start, end, region = `US`) {
	return `https://data.${region?.toLowerCase() === 'eu' ? "eu." : ""}mixpanel.com/api/2.0/export?from_date=${start}&to_date=${end}`;
};

exports.profileExport = function (projectId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/2.0/engage?project_id=${projectId}`;
};

exports.listCohorts = function (projectId, workspaceId, region = `US`) {
	return `https://${getRegion(region)}mixpanel.com/api/2.0/cohorts/list?project_id=${projectId}&workspace_id=${workspaceId}`;
};



function getRegion(region = 'US') {
	return `${region?.toLowerCase() === 'eu' ? "eu." : ""}`;
}

// layout payload
const layout = { "layout": { "rows": [{ "height": 0, "cells": [{ "id": "fEGqmELw", "width": 6 }, { "id": "dQ32tc8d", "width": 6 }], "id": "TUvsEPn4" }, { "height": 0, "cells": [], "id": "qATtSFxj" }], "rows_order": ["TUvsEPn4", "bTJDNg75", "qATtSFxj"] } };

// blacklisted keys
exports.blacklistKeys = [
	"TEXT",
	"MEDIA",
	"LAYOUT",
    "REPORTS",
	"dashboard_id",
	'last_modified_by_name',
	'last_modified_by_id',
	'last_modified_by_email',
    "id",
    "is_private",
    "creator",
    "creator_id",
    "creator_name",
    "creator_email",
    "is_restricted",
    "modified",
    "is_favorited",
    "pinned_date",
    "generation_type",
    "layout_version",
    "can_see_grid_chameleon",
    "can_update_basic",
    "can_view",
    "allow_staff_override",
    "is_superadmin",
    "can_share",
    "can_pin_dashboards",
    "can_update_restricted",
    "can_update_visibility",
    "created",
    "project_id",
    "workspace_id",
    "original_type",
    "include_in_dashboard",
    "is_default",
    "metadata",
    "dashboard",
    "is_visibility_restricted",
    "is_modification_restricted",
    "count",
    "created_by",
    "data_group_id",
    "last_edited",
    "last_queried",
    "referenced_by",
    "referenced_directly_by",
    "active_integrations",
    "user",
    "customPropertyId",
    "canUpdateBasic",
    "referencedBy",
    "referencedDirectlyBy",
    "referencedRawEventProperties",
    "project",
	"is_shared_with_project",
	"template_type"
];