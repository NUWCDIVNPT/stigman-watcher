# STIG Manager Watcher
A utility that watches a directory for test result files on behalf of a STIG Manager Collection. Each CKL or XCCDF file added to the directory is parsed and placed onto a timed cargo queue. If configured to do so, the utilty will create new Assets as needed and update STIG assignments. Reviews from the result files are POSTed to the corresponding Asset.

## Requirements
- Node.js 14+ and npm
- Keycloak 11+ OIDC client configured with a service account and appropriate scopes
- STIG Manager API with a Collection grant of "Manage" for the OIDC client

## Installation
```
$ git clone https://github.com/csmig/stigman-watcher
$ cd stigman-watcher
$ npm ci
```

## Configuration
The Watcher is configured by setting environment variables, with support for an `.env` file (sample provided).

| Variable | Description |
| --- | --- |
|WATCHER_ADD_EXISTING|Default: "false"<br>Whether the utility should consider existing files in the directory as newly added.|
|WATCHER_API_BASE|Default: "http://localhost:64001/api"<br>The base URL of the STIG Manager API instance.|
|WATCHER_AUTHORITY|Default: "http://localhost:8080/auth/realms/stigman"<br>The base URL of the OIDC authority providing signed JWTs for the API. The utility will append `/protocol/openid-connect/token` to this URL. |
|WATCHER_CARGO_DELAY|Default: 2000<br>Number of milliseconds to delay before processing the timed cargo queue. |
|WATCHER_CARGO_SIZE|Default: 25<br>The number of files (at most) that will occupy the timed cargo queue.| 
|WATCHER_CLIENT_ID|Default: "stigman-watcher"<br>The clientId of the OIDC Client for the utility. |
|WATCHER_CLIENT_KEY|No default<br>The private key file used to sign the OIDC client assertion (Signed JWT). Takes precendence over WATCHER_CLIENT_SECRET. |
|WATCHER_CLIENT_KEY_PASSPHRASE|No default<br>The passphrase, if any, that protects the WATCHER_CLIENT_KEY. |
|WATCHER_CLIENT_SECRET|No default<br>The client secret for the OIDC client.|
|WATCHER_COLLECTION|No default<br>The collectionId on whose behalf the utility watches.
|WATCHER_CREATE_OBJECTS|Default: "true"<br>Whether to permit the utility to create Assets and modify STIG assignments.|
|WATCHER_DIR|Default "."<br>The directory to watch, either a full path or relative to the current directory. Windows and UNC paths should replace \ with /. For example, //SERVER/SHARE/DIRECTORY or C:/DIRECTORY|


## Usage

```
Options:
      --help     Show help                                             [boolean]
      --version  Show version number                                   [boolean]
  -e, --env      Environment file                                       [string]
```
After setting the appropriate enviornment variables, execute:

```
node index.js
```

The utility will attempt to get a token from Keycloak and make a test request to the STIG Manager API. If this succeeds, it will begin monitoring the configured directory for added files. If WATCHER_ADD_EXISTING is set to "true", the utility will immediately process the contents of the directory as if the files were just added.

To stop execution, type `Ctrl-C`.