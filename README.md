# STIG Manager Watcher
A simple utility that watches a directory for test result files on behalf of a STIG Manager Collection. Each CKL or XCCDF file that is added to the directory (or updated) is parsed. If configured to do so, the utilty will create a new Collection Asset and update STIG assignments. Reviews from the result files are POSTed to the STIG Manager Collection.

## Requirements
- Node.js 14+
- npm

## Installation
```
$ git clone https://github.com/csmig/stigman-watcher
$ cd stigman-watcher
$ npm ci
```

## Configuration
The Watcher is configured by setting environment variables

| Variable | Description |
| --- | --- |
|STIGMAN_WATCHER_ADD_EXISTING|Default: "false"<br>Whether the utility should consider existing files in the directory as newly added|
|STIGMAN_WATCHER_APIBASE|Default: "http://localhost:64001/api"<br>The base URL of the STIG Manager API instance|
|STIGMAN_WATCHER_AUTHORITY|Default: "http://localhost:8080/auth/realms/stigman"<br>The base URL of the OIDC authority providing signed JWTs to the API server. The API will append `/protocol/openid-connect/token` to this URL |
|STIGMAN_WATCHER_CLIENTID|Default: "stigman-watcher"<br>The clientId of the OIDC Client for the utility |
|STIGMAN_WATCHER_COLLECTION|No default<br>The collectionId on whose behalf the utility watches
|STIGMAN_WATCHER_CREATE_OBJECTS|Default: "true"<br>Whether to permit the utility to create Assets and modify STIG assignments|
|STIGMAN_WATCHER_DIR|Default "."<br>The directory to watch, either a full path or relative to the current directory|
|STIGMAN_WATCHER_SECRET|No default|The client secret for the OIDC client|


## Running
After setting the appropriate enviornment variables, execute:

```
node index.js
```

The utility will attempt to get a token from the OIDC authority and make a test request to the STIG Manager API. If this succeeds, it will begin monitoring the configured directory. If STIGMAN_WATCHER_IGNORE_INITIAL is not set to "true", the utility will immediately process the current contents of the directory as if the files were just added.

To stop execution, type `Ctrl-C`.