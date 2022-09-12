# mpMigrate

## wat.

`mpMigrate` is a command-line ETL script in Node.js that provides one-time mixpanel **project migrations**. [watch the demo](#demo) to see it in action.

essentially, this utility can **copy** most saved entities in any mixpanel project including:

 - events
 - user profiles
 - schemas (lexicon)
 - dashboards
 - saved reports
 - custom events
 - custom properties

using [service accounts](https://developer.mixpanel.com/reference/authentication#service-accounts), this script copies JSON payloads from saved entities in a source project to and creates new entities in a target project.

there are a number of use-cases for this script including:

 - merging projects in separate platforms (web, android, iOS) together into a common project
 - fixing immutable event data with light transformations 
 - auditing an existing project's saved entities
 - "Starting Over" without losing your work.

this software can be [run as a CLI](#CLI) (using environment variables) or implemented as a [native module in code](#module). It can also be used to [delete all saved entities](#delete) in a project

currently **not** supported:

 - nested saved entities (e.g. cohorts within cohorts)
 - copying data views + settings
 - user invites
 - session/group keys/timezone and other global project settings
 - saved entity permissions (defaults to global access to all users)
 - text cards on dashboards

## tldr;
supply credentials:
```bash
echo "SOURCE_ACCT = '{{ OLD project service account }}'
SOURCE_PASS = '{{ OLD project service secret }}'
SOURCE_PROJECT = '{{ OLD project id }}'
SOURCE_DATE = '{{ date of first event in OLD project, eg... 04-20-2022 }}'
SOURCE_REGION = 'US'
TARGET_ACCT = '{{ NEW project service account }}'
TARGET_PASS = '{{ NEW project secret }}'
TARGET_PROJECT = '{{ NEW project id }}'
TARGET_REGION = 'US'" > .env
```

then migrate

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
SOURCE_ACCT = ''  #service account username for the source project
SOURCE_PASS = ''  #service account secret for the source project
SOURCE_PROJECT = ''  #source project's ID
SOURCE_DATE = ''  #the start date (if you're copying events)
SOURCE_REGION = 'US' #either US or EU based on project's region; optional if US 
TARGET_ACCT = ''  #service account username for target project
TARGET_PASS = ''  #service account secret for target project
TARGET_PROJECT = ''  #target project's ID
TARGET_REGION = 'EU' #mandatory if project uses EU residency
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
	start: "04-20-2022" //date of first event	
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
i'm serious... there's no way to undo this. unfortunutely this will not not delete events or profiles in the project.