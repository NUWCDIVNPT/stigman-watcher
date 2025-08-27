# STIGMan Watcher Container Documentation

## Overview

STIGMan Watcher is now available as a containerized application to simplify deployment, updates, and enable distribution via Iron Bank. The container provides all necessary dependencies and runs the watcher as a non-root user for security.

## Quick Start

### Using Docker

```bash
# Build the image
docker build -t stigman-watcher .

# Run with minimum required configuration
docker run --rm \
  -v ./watched:/home/node/watched \
  -v ./history:/home/node/history \
  -v ./logs:/home/node/logs \
  -e WATCHER_API_BASE=http://hostname:64001/api \
  -e WATCHER_AUTHORITY=http://hostname:8082 \
  -e WATCHER_CLIENT_ID=admin \
  -e WATCHER_CLIENT_SECRET=your-secret \
  -e WATCHER_COLLECTION=9 \
  -e WATCHER_MODE=scan \
  stigman-watcher
```

### Using Docker Compose

```bash
# Copy and customize docker-compose.yml
cp docker-compose.yml docker-compose.local.yml

# Edit docker-compose.local.yml with your configuration
# Then run:
docker-compose -f docker-compose.local.yml up
```

## Required Bind Mounts

The container expects the following directories to be mounted:

| Container Path | Purpose | Required |
|---------------|---------|----------|
| `/home/node/watched` | Directory containing STIG test result files to be processed | Yes |
| `/home/node/history` | Directory for scan history file persistence | Recommended |
| `/home/node/logs` | Directory for log file persistence | Recommended |

## Optional Bind Mounts

| Container Path | Purpose | When Needed |
|---------------|---------|-------------|
| `/home/node/certs/client.key` | Client certificate for mTLS authentication | When using `WATCHER_CLIENT_KEY` |
| `/home/node/certs/ca-bundle.pem` | Additional CA certificates | When using `NODE_EXTRA_CA_CERTS` |

## Environment Variables

### Required Configuration

- `WATCHER_API_BASE` - Base URL of the STIG Manager API service
- `WATCHER_AUTHORITY` - Base URL of the OIDC authentication service
- `WATCHER_CLIENT_ID` - OIDC client ID for authentication
- `WATCHER_COLLECTION` - Collection ID to manage

### Authentication (Choose One)

**Option 1: Client Secret**
- `WATCHER_CLIENT_SECRET` - OIDC client secret

**Option 2: Client Certificate**
- `WATCHER_CLIENT_KEY` - Path to client certificate (e.g., `/home/node/certs/client.key`)
- `WATCHER_CLIENT_KEY_PASSPHRASE` - Passphrase for encrypted certificate (optional)

### Container Paths (Pre-configured)

The following environment variables are pre-set in the container but can be overridden:

- `WATCHER_PATH=/home/node/watched` - Base path to watch
- `WATCHER_HISTORY_FILE=/home/node/history/history.json` - Scan history file location
- `WATCHER_LOG_FILE=/home/node/logs/watcher.log` - Log file location

### Optional Configuration

- `WATCHER_MODE` - Operation mode: `scan` or `events` (default: `events`)
- `WATCHER_ADD_EXISTING` - Process existing files on startup (`true`/`false`)
- `WATCHER_CREATE_OBJECTS` - Create Assets/STIG Assignments as needed (`true`/`false`)
- `WATCHER_LOG_LEVEL` - Console log level: `error`, `warn`, `info`, `debug`, etc.
- `WATCHER_LOG_FILE_LEVEL` - File log level
- `NODE_EXTRA_CA_CERTS` - Path to additional CA certificates

## Examples

### Basic Scan Mode

```bash
docker run --name watcher --rm \
  -v /path/to/your/files:/home/node/watched \
  -v ./history:/home/node/history \
  -v ./logs:/home/node/logs \
  -e WATCHER_MODE=scan \
  -e WATCHER_COLLECTION=9 \
  -e WATCHER_API_BASE=http://hostname:64001/api \
  -e WATCHER_AUTHORITY=http://hostname:8082 \
  -e WATCHER_CLIENT_ID=admin \
  -e WATCHER_CLIENT_SECRET=your-secret \
  stigman-watcher
```

### Events Mode with Client Certificate

```bash
docker run --name watcher --rm \
  -v /path/to/your/files:/home/node/watched \
  -v ./history:/home/node/history \
  -v ./logs:/home/node/logs \
  -v /path/to/client.key:/home/node/certs/client.key:ro \
  -e WATCHER_MODE=events \
  -e WATCHER_COLLECTION=9 \
  -e WATCHER_API_BASE=https://hostname:64001/api \
  -e WATCHER_AUTHORITY=https://hostname:8082 \
  -e WATCHER_CLIENT_ID=stigman-watcher \
  -e WATCHER_CLIENT_KEY=/home/node/certs/client.key \
  stigman-watcher
```

### One-Shot Processing

```bash
docker run --name watcher --rm \
  -v /path/to/your/files:/home/node/watched \
  -e WATCHER_COLLECTION=9 \
  -e WATCHER_API_BASE=http://hostname:64001/api \
  -e WATCHER_AUTHORITY=http://hostname:8082 \
  -e WATCHER_CLIENT_ID=admin \
  -e WATCHER_CLIENT_SECRET=your-secret \
  stigman-watcher --one-shot
```

## Logging

The container is configured to output logs to both:
1. **Container STDOUT** - For `docker logs` command and log aggregation systems
2. **Log file** - `/home/node/logs/watcher.log` (if volume is mounted)

To view logs:
```bash
# View real-time logs
docker logs -f watcher

# View log file (if mounted)
tail -f ./logs/watcher.log
```

## Building the Image

```bash
# Build from source
docker build -t stigman-watcher:latest .

# Build with specific tag
docker build -t stigman-watcher:1.5.4 .
```

## Security Considerations

- The container runs as the `node` user (UID 1000) for security
- No privileged access required
- Client certificates should be mounted read-only
- Consider using Docker secrets for sensitive environment variables

## Troubleshooting

### Permission Issues
Ensure the mounted directories are writable by UID 1000:
```bash
sudo chown -R 1000:1000 ./watched ./history ./logs
```

### Connection Issues
Check your firewall settings and ensure the STIG Manager API and OIDC provider are accessible from the container network.

### Certificate Issues
Verify certificate paths and permissions:
```bash
# Check certificate in container
docker run --rm -v /path/to/cert:/tmp/cert:ro stigman-watcher:latest sh -c "ls -la /tmp/cert"
```