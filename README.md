<p align="center">
  <img width="125" src="https://raw.githubusercontent.com/NUWCDIVNPT/stigman-watcher/main/icon.svg">
</p>
<h1 align="center"> STIG Manager Watcher </h1>

A utility that watches a path for STIG test result files on behalf of a [STIG Manager](https://github.com/nuwcdivnpt/stig-manager) Collection. Each CKL or XCCDF file added to the path or any sub-paths is parsed and placed onto a timed cargo queue. If configured to do so, the utilty will create new Assets as needed and update STIG assignments. Reviews from the result files are POSTed to the corresponding Asset.

## Requirements
- Node.js 14+ and npm
- [STIG Manager API](https://github.com/nuwcdivnpt/stig-manager) with a Collection grant of "Manage" for the OIDC client
- Keycloak 11+ configured to provide tokens to the STIG Manager API.
- A Keycloak client configured with a service account and scopes `stig-manager:collection` and `stig-manager:stig:read`

## Installation

```
$ npm install --global stigman-watcher
```

## Usage

```
stigman-watcher [options]
```

## Options

Many options can be set with an environment variable prefixed by `WATCHER_`. The environment can be set from an `.env` file in the current directory.

**--add-existing**

Process existing files in the watched path (`WATCHER_ADD_EXISTING=1`). Negate with `--no-add-existing`.

---  
**--api *url*** 

*Required.* Base URL of the STIG Manager API (`WATCHER_API_BASE`) *required*

---  
**--authority *url***

*Required.* Base URL of the OIDC authority (`WATCHER_AUTHORITY`)
  
---
**-c, --collection-id *id***

*Required.* collectionId to manage (`WATCHER_COLLECTION`)
  
---
**--cargo-delay *ms***

Milliseconds to delay processing the queue (`WATCHER_CARGO_DELAY`) (default: 2000)
  
---
**--cargo-size *number***

Maximum queue size that triggers processing (`WATCHER_CARGO_SIZE`) (default: 25)
  
---
**--client-id *string***

*Required.* OIDC clientId to authenticate (WATCHER_CLIENT_ID). You will be prompted for the client secret if `--client-key` is not provided and `--prompt` is provided, unless `WATCHER_CLIENT_SECRET` is set.
  
---
**--client-key *path***

Path to a PEM encoded private key (`WATCHER_CLIENT_KEY`). If the key
is encrypted, you will be prompted for the passphrase if `--prompt` is
provided, unless `WATCHER_CLIENT_KEY_PASSPHRASE` is set.
  
---
**--create-objects**

Create Assets or STIG Assignments as needed (`WATCHER_CREATE_OBJECTS=1`). Negate with `--no-create-objects`. (default: true)
  
---
**-d, --debug**

Shortcut for `--log-level debug --log-file-level debug`
  
---
**-h, --help**

Shows the available options, their corresponding environment variables, and their current values based on the environment.
  
---
**--ignore-dir *[names...]***

Sub-directory name to ignore. Can be invoked multiple times.(`WATCHER_IGNORE_DIRS=<csv>`)
  
---
**--log-color**

Colorize the console log output. Might confound downstream piped processes.
  
---
**--log-file *path***

Path to the log file (`WATCHER_LOG_FILE`). Will be created if needed. Disable file logging with `--no-log-file`.
  
---
**--log-file-level *level***

Log level for the log file (`WATCHER_LOG_FILE_LEVEL`) (choices: "error", "warn", "info", "http", "verbose", "debug", "silly") (default: "verbose")

--- 
**--log-level *level***

Log level for the console (`WATCHER_LOG_LEVEL`) (choices: "error", "warn", "info", "http", "verbose", "debug", "silly") (default: "info")

  
---
**--no-add-existing**

Ignore existing files in the watched path (`WATCHER_ADD_EXISTING=0`).
  
---
**--no-create-objects**

Do not create Assets or STIG Assignments (`WATCHER_CREATE_OBJECTS=0`).
  
---
**--no-log-file**

Disable logging to a logfile
  
---
**--no-use-polling**

Use file system events without polling (`WATCHER_USE_POLLING=0`).
  
---
**--one-shot**

Process existing files in the watched path and exit. Sets `--add-existing`.
  
---
**-p, --path *path***

Path to watch (`WATCHER_PATH`) (default: ".")
  
---
**--prompt**

Prompt for missing secret or passphrase
  
---
**-s, --silent**

Disable logging to the console
  
---
**--stability-threshold *ms***

Milliseconds to wait for file size to stabilize. May be helpful when watching network shares. (`WATCHER_STABILITY_THRESHOLD`) (default: 0)
  
---
**--use-polling**

Use file system events with polling (`WATCHER_USE_POLLING`). Negate with --no-use-polling (default: true)
  
---
**--version**

Print the current version and exit

### Example
```
$ stigman-watcher \
  --client-id stigman-watcher \
  --collection-id 1 \
  --path /my/path/to/results \
  --authority https://keycloak-host/auth/realms/stigman \
  --api https://stigman-api/api
```
Unless `--one-shot` is provided, the utility remains active and processes every CKL or XCCDF file added under the given path. To stop execution send the process the `SIGINT` signal. If running from a shell, you can type `Ctrl-C` to exit.

## Logging

The utility streams structured JSON logs to the console and/or to a specified logfile. The log related options are:
```
--log-level
--log-file
--log-file-level
--log-color
--silent
```
