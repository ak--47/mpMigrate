# mpMigrate

NOTE: this package is now **deprecated**; 

- If you are looking to **copy boards or reports between projects**, see Mixpanel's new **MOVE** feature: https://docs.mixpanel.com/changelogs/2023-07-27-move

- If you are looking to **move data** (events + profiles) from one project to another, see: https://gist.github.com/ak--47/05d73181bf85d4b47317dee9d16aed4d

i will leave this up for posterity, but it is no longer maintained.

## wat.

`mpMigrate` is a command-line ETL script in Node.js that provides one-time mixpanel **project migrations**. [watch the demo](#demo) to see it in action.

## tldr; <div id="cli"></div>

the simplest way to get started is to use the CLI; from your shell

```
npx --yes mp-migrate@latest
```
(requires [node.js v16.x](https://nodejs.org/en/download/))

the cli wizard will walk you through your migration. logs are stashed in `./savedProjects/<project name>` 



## about

this utility can **copy** most saved entities in any mixpanel project including:

 - events
 - user profiles
 - schemas (lexicon)
 - dashboards (and layouts)
	- saved reports
	- text and media cards
 - custom events
 - custom properties

you will authenticate using [service accounts](https://developer.mixpanel.com/reference/authentication#service-accounts) or a [bearer token](https://mixpanel.com/oauth/access_token). 

the script will copy JSON payloads from saved entities in a **source project** to and create those as new entities in a **target project**.

there are a number of use-cases for this script including:

 - merging projects in separate platforms (web, android, iOS) together into a common project
 - fixing immutable event data with light transformations 
 - sending a single dashboard (or selection of dashboards) from an old to new project
 - auditing an existing project's saved entities
 - "Starting Over" without losing your work.

this software can be [run as a CLI](#cli) (using environment variables) or implemented as a [native module in code](#module). It can also be used to [delete all saved entities](#delete) in a project

currently **not** supported:

 - identity resolution (mapping `anon_id`s to `known_id`s) 
 - nested saved entities (e.g. cohorts within cohorts)
 - unsaved custom properties
 - copying data views + settings
 - user invites
 - session/group keys/timezone and other global project settings
 - saved entity permissions (defaults to global access to all users)

## authentication

to use `mp-migrate` you will need to provide authentication details so that it can access your mixpanel project. two methods of authentication are supported:

- [service accounts](https://developer.mixpanel.com/reference/authentication#service-accounts)  (created in the Mixpanel UI). 
- [bearer token](https://mixpanel.com/oauth/access_token) (can be viewed at `https://mixpanel.com/oauth/access_token`)

bearer tokens are JSON of the form:

```javascript
{"token": "my-temporary-bearer-token"}
```

your [bearer token](https://mixpanel.com/oauth/access_token) uniquely identifies **your user account** in a particular project ... these values are rotated at a regular interval. when using your [bearer token](https://mixpanel.com/oauth/access_token), only include the _string value_ of the `token` key (`"my-temporary-bearer-token"` in the example above).

when using [service accounts](https://developer.mixpanel.com/reference/authentication#service-accounts), reports that are created will be "created by" the service account. when using [bearer tokens](https://mixpanel.com/oauth/access_token), reports that are created will be "created by" **you**.

**as a best practice:** 
- if you are copying data **AND** reports... use a [service account](https://developer.mixpanel.com/reference/authentication#service-accounts)
- if you are _only_ copying reports, use your [bearer token](https://mixpanel.com/oauth/access_token).


## storing credentials

if you do not wish to entire your credentials each time, you can (optionally) create a `.env` credentials file in your current working directory, which the script will then use for auth details:
```bash
echo "SOURCE_ACCT = '' 
SOURCE_PASS = ''
SOURCE_BEARER = '' 	
SOURCE_PROJECT = '' 
SOURCE_DATE_START = '' 
SOURCE_DATE_END = ''
SOURCE_REGION = '' 	
SOURCE_DASH_ID = ''

TARGET_ACCT = '' 	
TARGET_PASS = ''
TARGET_BEARER = '' 	 	
TARGET_PROJECT = ''	
TARGET_REGION = ''" > .env
```
**none of these params are required** ... if a value is empty, the CLI will prompt you for a value

- if using `.env`, edit your **SOURCE** and **TARGET** environment variables according to this table:

| VAR                 |  default | notes                                                       |
|------------------------|----------------------|-------------------------------------------------------------|
|`SOURCE_ACCT`  | --- | the service account of your SOURCE project |
|`SOURCE_PASS`  | --- | the service account secret of your SOURCE project |
|`SOURCE_BEARER`  | --- | the bearer token (if applicable) for your SOURCE project |
|`SOURCE_PROJECT`  | --- | the SOURCE's `project_id` |
|`SOURCE_DATE_START`  | TODAY | optional: if copying events - when to start `MM-DD-YYYY` |
|`SOURCE_DATE_END`  | TODAY | optional: if copying events - when to end `MM-DD-YYYY` |
|`SOURCE_REGION`  | `'US'` |  `US` or `EU` |
|`SOURCE_DASH_ID`  | --- | optional: a `dashboard_id` (or comma sep list of `dashboard_id`s) for coping a subset of dashboards |
|`TARGET_ACCT`  | --- | the service account of your TARGET project |
|`TARGET_PASS`  | --- | the service account secret of your TARGET project |
|`SOURCE_BEARER`  | --- | the bearer token (if applicable) for your TARGET project |
|`TARGET_PROJECT`  | --- | the TARGET project id |
|`TARGET_REGION`  | `'US'` |  `US` or `EU` |

(note: **service account** and **bearer token** authentication options are mutually exclusive; if you provide _both_ the bearer token will be used)


# DEMO <div id="demo"></div>
[![mpMigrate Demo](https://aktunes.neocities.org/mpMigrate/migrateThumb.png)](https://youtu.be/jOCcFiT53gU)

## Module <div id="module"></div>

you can also use `mpMigrate` within an existing script; this allows you to specify more options in code, and skip the prompts.

```bash
$ npm i mp-migrate
```
then

```javascript
const mpMigrate = require('mp-migrate')
```
and finally

```javascript
let source = {
	// choose service acct + pass or bearer
	acct: `{{ service acct }}`,
	pass: `{{ service secret }}`,
	bearer: `{{ bearer token}}`,
	
	//required
	project: 12345,
	region: "US", //default 'US'

	//optional
	dash_id: ['12345', '67890'] //list of dashboards to copy
	start: "04-20-2022", //date of first event	
	end: "04-201-2022" //date of last event
}
let target = {
	// choose service acct + pass or bearer
	acct: `{{ service acct }}`,
	pass: `{{ service secret }}`,
	bearer: `{{ bearer token}}`,
	
	//required
	project: 67890,
	region: "EU"
}

//copy project 12345 to project 67890
const migrateProjects = await mpMigrate(source, target)
```

### specifying options

you can pass a third `options` object to the module; these are all the default values:

```javascript
let options = {
	// will be called on every event
	transformEventsFunc: x => x, 

	// will be called on every profile
	transformProfilesFunc: x => x, 

	//generate a summary of the source project?
	shouldGenerateSummary: true, 

	//copy events from source to target?
	shouldCopyEvents: false, 

	//copy schema (lexicon) from source to target?
	shouldCopySchema: false, 

	//copy user profiles from source to target?
	shouldCopyProfiles: false, 

	//copy saved entities from source to target?
	shouldCopyEntities: false, 
	
	//if true, will not print console messages
	silent: false, 

	//if true, will skip the confirmation prompt... use at own risk!
	skipPrompt: false 
}

const migrateProjects = await mpMigrate(source, target, options)
```

### deleting entities <div id="delete"></div>

you can also use the `mp-migrate` package to **delete saved entities** in an existing project... but please be careful; this is **irreversible**. 

⚠️ use with caution ⚠️

```javascript
const { entityDelete } =  require('mp-migrate')
let target = {
	acct: `{{ service acct }}`,
	pass: `{{ service secret }}`,
	bearer: `{{ bearer token }}`
	project: 12345,
	region: `US`
}
let result = await entityDelete(target)
```
i'm serious... there's no way to undo this. unfortunately this will not not delete events or profiles in the project.