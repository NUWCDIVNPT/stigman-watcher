<p align="center">
  <img width="125" src="https://raw.githubusercontent.com/NUWCDIVNPT/stigman-watcher/main/icon.svg">
</p>
<h1 align="center"> STIG Manager Watcher </h1>

<a href="https://www.npmjs.com/package/@nuwcdivnpt/stigman-watcher"><img src="https://img.shields.io/npm/v/@nuwcdivnpt/stigman-watcher"></a>

A [STIG Manager](https://github.com/nuwcdivnpt/stig-manager) CLI client that watches a path for test result files formatted as CKL or XCCDF and posts the results to a Collection.

The client is suitable for use as a service or daemon, as a scheduled task, in automated testing pipelines, or from the command line. Test result files discovered on the path and sub-paths are parsed and the parsed content is pushed to a timed cargo queue. If configured to do so, the queue worker creates new Assets as needed and updates STIG assignments. Reviews from the result files are then posted to the corresponding Asset.

## Requirements
- Node.js 14+ and npm, if Watcher is run from source or as a global npm module
- An OIDC Provider supporting the Client Credentials Flow which issues tokens scoped for the STIG Manager API.
- [STIG Manager API](https://github.com/nuwcdivnpt/stig-manager) with a Collection grant of "Manage" for the client

## Installation and Usage

You can install Watcher using one of these methods:

### Using Docker (Recommended)

```bash
# Build the container
docker build -t stigman-watcher .

# Run with docker-compose (easiest)
docker-compose up

# Or run directly with docker
docker run --rm \
  -v ./watched:/home/node/watched \
  -v ./history:/home/node/history \
  -v ./logs:/home/node/logs \
  -e WATCHER_API_BASE=http://hostname:64001/api \
  -e WATCHER_AUTHORITY=http://hostname:8082 \
  -e WATCHER_CLIENT_ID=admin \
  -e WATCHER_CLIENT_SECRET=your-secret \
  -e WATCHER_COLLECTION=9 \
  stigman-watcher
```

See [DOCKER.md](DOCKER.md) for comprehensive containerization documentation.

### Copy a Release binary to a destination of your choice and execute
```
$ ./stigman-watcher-linuxstatic [options]
```
or
```
C:/> stigman-watcher-win.exe [options]
``` 
### Install globally via NPM and run the module 
```
$ npm install --global @nuwcdivnpt/stigman-watcher
$ stigman-watcher [options]
```

### Clone this repo and run the source code
```
$ git clone https://github.com/NUWCDIVNPT/stigman-watcher.git
$ node index.js [options]
```

## Wiki

Please see the [Wiki](https://github.com/nuwcdivnpt/stigman-watcher/wiki) for documentation.
