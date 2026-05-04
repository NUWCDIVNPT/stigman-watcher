#!/bin/bash

# This file is used to build binaries on a Linux device.
# Requires:
# - Node.js 20+
# - Docker (for musl-linked Linux binary)
# - jq
# - zip
# - tar
# - xz-utils (for extracting the official linux-x64 glibc node tarball)
# - curl

check_exit_status() {
  if [[ $? -eq 0 ]]; then
    echo "[BUILD_TASK] $1 succeeded"
  else
    echo "[BUILD_TASK] $1 failed"
    exit $2
  fi
}

bin_dir=./bin
dist_dir=./dist

# stop the script if SIGINT received during any command
trap 'exit 1' INT

# Change to this script directory
cd "$(dirname "$(realpath "$0")")"

# Prepare
[ ! -d "$bin_dir" ] && mkdir -p "$bin_dir"
[ ! -d "$dist_dir" ] && mkdir -p "$dist_dir"
rm -rf $bin_dir/*
rm -rf $dist_dir/*
printf "[BUILD_TASK] Fetching node_modules\n"
rm -rf ./node_modules
npm ci

# Get version from package.json
version=$(jq -r .version package.json)
check_exit_status "Getting Version" 1
printf "\n[BUILD_TASK] Using version string: $version\n"

# Bundle with esbuild, inlining the version
printf "[BUILD_TASK] Bundling\n"
npx esbuild index.js --bundle --platform=node --outfile=bundle.cjs \
  --define:STIGMAN_WATCHER_VERSION=\"$version\"
check_exit_status "Bundling" 2

# Generate SEA blob
printf "\n[BUILD_TASK] Generating SEA blob\n"
node --experimental-sea-config sea-config.json
check_exit_status "SEA blob generation" 3

# Linux musl binary (Alpine Docker — for Alpine/distroless/scratch containers)
# Inside the container, redirect postject/cp output to stderr so the captured
# stdout contains only the Node version printed at the end. Both streams are
# still visible in CI logs.
printf "\n[BUILD_TASK] Building Linux musl binary (via Alpine)\n"
NODE_FULL_VERSION=$(docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "
  cp \$(command -v node) bin/stigman-watcher-linux-musl >&2 && \
  npx postject bin/stigman-watcher-linux-musl NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 >&2 && \
  node -e 'console.log(process.version)'
")
check_exit_status "Building Linux musl Binary" 4

# Same Node version is reused for the glibc and Windows targets so the SEA blob
# stays portable across all three binaries (useCodeCache/useSnapshot are off).
# Validate format (vMAJOR.MINOR.PATCH) so a polluted capture fails fast rather
# than corrupting downstream URLs.
if ! [[ "$NODE_FULL_VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "[BUILD_TASK] NODE_FULL_VERSION not a clean version string: '$NODE_FULL_VERSION'"
  exit 4
fi
printf "[BUILD_TASK] Node version (shared across targets): $NODE_FULL_VERSION\n"

# Linux glibc binary (official linux-x64 tarball — for Ubuntu/Debian/RHEL/etc.)
printf "\n[BUILD_TASK] Downloading Linux glibc Node.js $NODE_FULL_VERSION binary\n"
curl -fSL -o node-linux-glibc.tar.xz \
  "https://nodejs.org/dist/${NODE_FULL_VERSION}/node-${NODE_FULL_VERSION}-linux-x64.tar.xz"
check_exit_status "Downloading Linux glibc Node" 5

printf "\n[BUILD_TASK] Building Linux glibc binary\n"
tar -xJf node-linux-glibc.tar.xz \
  --strip-components=2 -C "$bin_dir" \
  "node-${NODE_FULL_VERSION}-linux-x64/bin/node"
mv "$bin_dir/node" "$bin_dir/stigman-watcher-linux-glibc"
npx postject "$bin_dir/stigman-watcher-linux-glibc" NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
check_exit_status "Building Linux glibc Binary" 6

# Windows binary (download matching Windows node.exe, inject on host)
printf "\n[BUILD_TASK] Downloading Windows Node.js $NODE_FULL_VERSION binary\n"
curl -fSL -o node-win.exe \
  "https://nodejs.org/dist/${NODE_FULL_VERSION}/win-x64/node.exe"
check_exit_status "Downloading Windows Node" 7

printf "\n[BUILD_TASK] Building Windows binary\n"
cp node-win.exe $bin_dir/stigman-watcher-win.exe
npx postject $bin_dir/stigman-watcher-win.exe NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
check_exit_status "Building Windows Binary" 8

# Archives
windows_archive=$dist_dir/stigman-watcher-win-$version.zip
printf "\n[BUILD_TASK] Creating $windows_archive\n"
zip --junk-paths $windows_archive ./dotenv-example $bin_dir/stigman-watcher-win.exe
check_exit_status "Zipping Windows Archive" 9

linux_musl_archive=$dist_dir/stigman-watcher-linux-musl-$version.tar.gz
printf "\n[BUILD_TASK] Creating $linux_musl_archive\n"
tar -czvf $linux_musl_archive --xform='s|^|stigman-watcher/|S' -C . dotenv-example -C $bin_dir stigman-watcher-linux-musl
check_exit_status "Tarring Linux musl Archive" 10

linux_glibc_archive=$dist_dir/stigman-watcher-linux-glibc-$version.tar.gz
printf "\n[BUILD_TASK] Creating $linux_glibc_archive\n"
tar -czvf $linux_glibc_archive --xform='s|^|stigman-watcher/|S' -C . dotenv-example -C $bin_dir stigman-watcher-linux-glibc
check_exit_status "Tarring Linux glibc Archive" 11

# Cleanup
rm -f sea-prep.blob bundle.cjs node-win.exe node-linux-glibc.tar.xz

printf "\n[BUILD_TASK] Done\n"
