<p align="center">
  <img width="125" src="https://raw.githubusercontent.com/NUWCDIVNPT/stigman-watcher/main/icon.svg">
</p>
<h1 align="center"> STIG Manager Watcher </h1>

<a href="https://npmjs.org/package/stigman-watcher"><img src="https://img.shields.io/badge/npm-1.1.1-green"></a>

A [STIG Manager](https://github.com/nuwcdivnpt/stig-manager) CLI client that watches a path for test result files formatted as CKL or XCCDF and posts the results to a Collection.

The client is suitable for use as a service or daemon, as a scheduled task, in automated testing pipelines, or from the command line. Test result files discovered on the path and sub-paths are parsed and the parsed content is pushed to a timed cargo queue. If configured to do so, the queue worker creates new Assets as needed and updates STIG assignments. Reviews from the result files are then posted to the corresponding Asset.

## Requirements
- Node.js 14+ and npm
- Keycloak 11+ configured to issue tokens for the STIG Manager API.
- A Keycloak OpenID Connect client configured with a service account and appropriate scopes.
- [STIG Manager API](https://github.com/nuwcdivnpt/stig-manager) with a Collection grant of "Manage" for the client

## Installation

```
$ npm install --global stigman-watcher
```

## Usage

```
stigman-watcher [options]
```

## Wiki

Please see the [Wiki](https://github.com/nuwcdivnpt/stigman-watcher/wiki) for documentation.
