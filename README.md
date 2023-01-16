# mpMigrate

## wat.

`mpMigrate` is a command-line ETL script in Node.js that provides one-time mixpanel **project migrations**. [watch the demo](#demo) to see it in action.

essentially, this utility can **copy** most saved entities in any mixpanel project including:

 - events
 - user profiles
 - schemas (lexicon)
 - dashboards (and layouts)
	- saved reports
	- text and media cards
 - custom events
 - custom properties

using [service accounts](https://developer.mixpanel.com/reference/authentication#service-accounts), this script copies JSON payloads from saved entities in a source project to and creates new entities in a target project.

there are a number of use-cases for this script including:

 - merging projects in separate platforms (web, android, iOS) together into a common project
 - fixing immutable event data with light transformations 
 - sending a single dashboard (or selection of dashboards) from an old to new project
 - auditing an existing project's saved entities
 - "Starting Over" without losing your work.

this software can be [run as a CLI](#CLI) (using environment variables) or implemented as a [native module in code](#module). It can also be used to [delete all saved entities](#delete) in a project

currently **not** supported:

 - identity resolution (mapping `anon_id`s to `known_id`s) 
 - nested saved entities (e.g. cohorts within cohorts)
 - unsaved custom properties
 - copying data views + settings
 - user invites
 - session/group keys/timezone and other global project settings
 - saved entity permissions (defaults to global access to all users)


## tldr;
- create credentials file:
```bash
echo "SOURCE_ACCT = '' 
SOURCE_PASS = '' 	
SOURCE_PROJECT = '' 
SOURCE_DATE_START = '' 
SOURCE_DATE_END = ''
SOURCE_REGION = '' 	
SOURCE_DASH_ID = ''

TARGET_ACCT = '' 	
TARGET_PASS = '' 	
TARGET_PROJECT = ''	
TARGET_REGION = ''" > .env
```
see [CLI Usage](#CLI)  for an annotated example 

- edit your **SOURCE** and **TARGET** environment variables according to this table:

| VAR                 |  default | notes                                                       |
|------------------------|----------------------|-------------------------------------------------------------|
|`SOURCE_ACCT`  | --- | the service account of your SOURCE project |
|`SOURCE_PASS`  | --- | the service account secret of your SOURCE project |
|`SOURCE_PROJECT`  | --- | the SOURCE's `project_id` |
|`SOURCE_DATE_START`  | TODAY | optional: if copying events - when to start `MM-DD-YYYY` |
|`SOURCE_DATE_END`  | TODAY | optional: if copying events - when to end `MM-DD-YYYY` |
|`SOURCE_REGION`  | `'US'` |  `US` or `EU` |
|`SOURCE_DASH_ID`  | --- | optional: a `dashboard_id` (or comma sep list of `dashboard_id`s) for coping a subset of dashboards |
|`TARGET_ACCT`  | --- | the service account of your TARGET project |
|`TARGET_PASS`  | --- | the service account secret of your TARGET project |
|`TARGET_PROJECT`  | --- | the TARGET project id |
|`TARGET_REGION`  | `'US'` |  `US` or `EU` |


- then migrate

```bash
$ npx mp-migrate
```

logs are stashed in `./savedProjects/<project name>` 

# DEMO <div id="demo"></div>
[![mpMigrate Demo](https://aktunes.neocities.org/mpMigrate/migrateThumb.png)](https://youtu.be/jOCcFiT53gU)

## CLI <div id="CLI"></div>
`mpMigrate` can be used as a command-line-interface which offers the user choices about which entities it will copy.

in this mode, a `.env` file is used to configure the `source` and `target` projects of the form:

```bash
SOURCE_ACCT = '' 		#REQ: the service account of your SOURCE project
SOURCE_PASS = '' 		#REQ: the service account secret of your SOURCE project
SOURCE_PROJECT = '' 	#REQ: the SOURCE project id
SOURCE_DATE_START = '' 	#optional: if copying events - when to start MM-DD-YYYY
SOURCE_DATE_END = ''	#optional: if copying events - when to end MM-DD-YYYY
SOURCE_REGION = '' 		#optional: if US... mandatory if 'EU'

#optional: a dashboard id (or comma separated list of dashboard ids) 
#to copy ONLY these dashboards to the target
SOURCE_DASH_ID = '' 	

TARGET_ACCT = '' 		#REQ: the service account of your TARGET project
TARGET_PASS = '' 		#REQ: the service account secret of your TARGET project
TARGET_PROJECT = ''		#REQ: the TARGET project id
TARGET_REGION = ''		#optional: if US... mandatory if 'EU'
```
with that configuration file present in the same directory, you can then run:
```bash
$ npx mp-migrate@latest
```
as the script runs, it will give you choices about which entities to copy:

![which entities to copy?](https://aktunes.neocities.org/mpMigrate/migrate1.png)

and will ask you to confirm your choice:

![enter image description here](https://aktunes.neocities.org/mpMigrate/migrate2.png)

## Module <div id="module"></div>

you can also use `mpMigrate` within an existing script; this allows you to specify more options in code, and skip the prompts.

```bash
$ npm i mp-migrate
```
then

```javascript
const { projectCopy } = require('mp-migrate')
```
and finally

```javascript
let source = {
	acct: `{{ service acct }}`,
	pass: `{{ service secret }}`,
	project: 12345,
	region: "US",
	start: "04-20-2022", //date of first event	
	end: "04-201-2022" //date of last event
	dash_id: ['12345', '67890'] //list of dashboards to copy
}
let target = {
	acct: `{{ service acct }}`,
	pass: `{{ service secret }}`,
	project: 67890,
	region: "EU"
}

//copy project 12345 to project 67890
const migrateProjects = await projectCopy(source, target)
```

### specifying options

you can pass a third `options` object to the module of the form:

```javascript
let options = {
	transformEventsFunc: x => x, // will be called on every event
	transformProfilesFunc: x => x, // will be called on every profile
	shouldGenerateSummary: false, //generate a summary of the source project?
	shouldCopyEvents: false, //copy events from source to target?
	shouldCopyProfiles: false, //copy user profiles from source to target?
	shouldCopyEntities: true //copy saved entities from source to target?
	silent: false, //if true, will not print console messages
	skipPrompt: false //if true, will skip the confirmation prompt... use at own risk!
}

const migrateProjects = await projectCopy(source, target, options)
```
specifying all of these options upfront will skip the user prompts.



### deleting entities <div id="delete"></div>

you can also use the `mp-migrate` package to **delete saved entities** in an existing project... but please be careful; this is **irreversible**. 

⚠️ use with caution ⚠️

```javascript
const { entityDelete } =  require('mp-migrate')
let target = {
	acct: `{{ service acct }}`,
	pass: `{{ service secret }}`,
	project: 12345,
	region: `US`
}
let result = await entityDelete(target)
```
i'm serious... there's no way to undo this. unfortunately this will not not delete events or profiles in the project.