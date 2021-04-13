# STIG Manager Watcher
A utility that watches a path for STIG test result files on behalf of a STIG Manager Collection. Each CKL or XCCDF file added to the directory is parsed and placed onto a timed cargo queue. If configured to do so, the utilty will create new Assets as needed and update STIG assignments. Reviews from the result files are POSTed to the corresponding Asset.

## Requirements
- Node.js 14+ and npm
- Keycloak 11+ OIDC client configured with a service account and appropriate scopes
- STIG Manager API with a Collection grant of "Manage" for the OIDC client

## Installation

To install from the `main` branch
```
$ npm install --global https://github.com/csmig/stigman-watcher
```

To install from other branches
```
$ npm install --global https://github.com/csmig/stigman-watcher#branch-name
```

## Usage

```
stigman-watcher [options]
```
Many options can be set with an environment variable (see [Configuration](#configuration)). 

## Options
Issuing the option `--help` shows the available options, their corresponding environment variables, and their current values based on the environment.
```
  --add-existing              Process existing files in the watched path. Negate with
                              --no-add-existing. (currently: false)
  
  --api <url>                 Base URL of the STIG Manager API (API_BASE) (REQUIRED)
  
  --authority <url>           Base URL of the OIDC authority (AUTHORITY) (REQUIRED)
  
  -c, --collection-id <id>    collectionId to manage (COLLECTION) (REQUIRED)
  
  --cargo-delay <ms>          Milliseconds to delay processing the queue (CARGO_DELAY)
                              (currently: 2000)
  
  --cargo-size <number>       Maximum queue size that triggers processing (CARGO_SIZE)
                              (currently: 25)
  
  --client-id <string>        OIDC clientId to authenticate (CLIENT_ID). You will be prompted
                              for the client secret if --client-key is not provided and --prompt
                              is provided, unless WATCHER_CLIENT_SECRET is set (REQUIRED)
  
  --client-key <path>         Path to a PEM encoded private key (CLIENT_KEY). If needed, you
                              will be prompted for the passphrase if --prompt is provided,
                              unless WATCHER_CLIENT_KEY_PASSPHRASE is set.
  
  --create-objects            Create Assets or STIG Assignments as needed (CREATE_OBJECTS).
                              Negate with --no-create-objects. (currently: true)
  
  -d, --debug                 Shortcut for --log-level debug --log-file-level debug (currently:
                              false)
  
  -h, --help                  display help for command
  
  --ignore-dir [names...]     Sub-directory name to ignore. Can be invoked multiple
                              times.(IGNORE_DIRS=<csv>)
  
  --log-color                 Colorize the console log output. Confuses some piped processes.
                              (currently: false)
  
  --log-file <path>           Path to the log file (LOG_FILE). Disable file logging with
                              --no-log-file (currently: false)
  
  --log-file-level <level>    Log level for the log file (LOG_FILE_LEVEL) (choices: "error",
                              "warn", "info", "http", "verbose", "debug", "silly", currently:
                              "verbose")
  
  --log-level <level>         Log level for the console (LOG_LEVEL) (choices: "error", "warn",
                              "info", "http", "verbose", "debug", "silly", currently: "info")
  
  --no-add-existing           Ignore existing files in the watched path.
  
  --no-create-objects         Do not create Assets or STIG Assignments.
  
  --no-log-file               Disable logging to a logfile
  
  --no-use-polling            Use file system events without polling.
  
  --one-shot                  Process existing files in the watched path and exit. Sets
                              --add-existing. (currently: false)
  
  -p, --path <path>           Path to watch (PATH) (currently: ".")
  
  --prompt                    Prompt for missing secret or passphrase (currently: false)
  
  -s, --silent                Disable logging to the console (currently: false)
  
  --stability-threshold <ms>  Milliseconds to wait for file size to stabilize. May be helpful
                              when watching network shares. (currently: 0)
  
  --use-polling               Use file system events with polling. Negate with --no-use-polling
                              (currently: true)
  
  --version                   Print the current version and exit


```
### Example
```
$ stigman-watcher \
  --client-id stigman-watcher \
  --collection-id 1 \
  --path /my/path/to/results \
  --authority https://keycloak-host/auth/realms/stigman \
  --api https://stigman-api/api
```
To stop execution, type `Ctrl-C`.
## Configuration

Many options can be set with an environment variable prefixed by "WATCHER_". The environment can also be set from an `.env` file in the current directory

| Variable | Description |
| --- | --- |
|WATCHER_ADD_EXISTING|Default: "false"<br>Whether the utility should consider existing files in the directory as newly added.|
|WATCHER_API_BASE|No default<br>The base URL of the STIG Manager API instance.|
|WATCHER_AUTHORITY|No default<br>The base URL of the OIDC authority providing signed JWTs for the API. The utility will append `/protocol/openid-connect/token` to this URL. |
|WATCHER_CARGO_DELAY|Default: 2000<br>Number of milliseconds to delay following the first push before processing the timed cargo queue. |
|WATCHER_CARGO_SIZE|Default: 25<br>The number of parsed files (at most) that will occupy the timed cargo queue.| 
|WATCHER_CLIENT_ID|No default<br>The clientId of the OIDC Client for the utility. |
|WATCHER_CLIENT_KEY|No default<br>The PEM encoded private key file used to sign the OIDC client assertion (Signed JWT). Takes precedence over WATCHER_CLIENT_SECRET. |
|WATCHER_CLIENT_KEY_PASSPHRASE|No default<br>The passphrase, if any, that protects the WATCHER_CLIENT_KEY. |
|WATCHER_CLIENT_SECRET|No default<br>The client secret for the OIDC client.|
|WATCHER_COLLECTION|No default<br>The collectionId on whose behalf the utility watches.
|WATCHER_CREATE_OBJECTS|Default: "true"<br>Whether to permit the utility to create Assets and modify STIG assignments.|
|WATCHER_IGNORE_DIRS|No default<br>Comma separated list of directory names to ignore.|
|WATCHER_PATH|Default "."<br>The path to watch, either a full path or relative to the current directory. Windows and UNC paths should replace \ with /. For example, //SERVER/SHARE/DIRECTORY or C:/DIRECTORY|
|WATCHER_STABILITY_THRESHOLD|Default 0<br>Milliseconds to wait for file size to stabilize. A high value may be helpful when watching network shares but will lower responsiveness.|
|WATCHER_USE_POLLING|Default "true"<br>Use file system events and polling. Set this to true to successfully watch files over a network.| 

## Logging

The utility streams structured JSON logs to the console and/or to a specified logfile. The log related options are:
```
--log-level
--log-file
--log-file-level
--log-color
--silent
```
