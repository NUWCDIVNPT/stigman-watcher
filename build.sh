#!/bin/bash

# This file is used to build binaries on a Linux device.
# Requires:
# - Node.js 20+
# - Docker (for musl-linked Linux binary)
# - jq
# - zip
# - tar
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

# Linux binary (musl-linked via Alpine Docker for broad compatibility)
printf "\n[BUILD_TASK] Building Linux binary (musl-linked via Alpine)\n"
NODE_FULL_VERSION=$(docker run --rm -v "$PWD":/app -w /app node:24-alpine sh -c "
  cp \$(command -v node) bin/stigman-watcher-linuxstatic && \
  npx postject bin/stigman-watcher-linuxstatic NODE_SEA_BLOB sea-prep.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 && \
  node -e 'console.log(process.version)'
")
check_exit_status "Building Linux Binary" 4

printf "[BUILD_TASK] Alpine Node version: $NODE_FULL_VERSION\n"

# Windows binary (download matching Windows node.exe, inject on host)
printf "\n[BUILD_TASK] Downloading Windows Node.js $NODE_FULL_VERSION binary\n"
curl -fSL -o node-win.exe \
  "https://nodejs.org/dist/${NODE_FULL_VERSION}/win-x64/node.exe"
check_exit_status "Downloading Windows Node" 5

printf "\n[BUILD_TASK] Building Windows binary\n"
cp node-win.exe $bin_dir/stigman-watcher-win.exe
npx postject $bin_dir/stigman-watcher-win.exe NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
check_exit_status "Building Windows Binary" 6

# Windows archive
windows_archive=$dist_dir/stigman-watcher-win-$version.zip
printf "\n[BUILD_TASK] Creating $windows_archive\n"
zip --junk-paths $windows_archive ./dotenv-example $bin_dir/stigman-watcher-win.exe
check_exit_status "Zipping Windows Archive" 7

# Linux archive
linux_archive=$dist_dir/stigman-watcher-linux-$version.tar.gz
printf "\n[BUILD_TASK] Creating $linux_archive\n"
tar -czvf $linux_archive --xform='s|^|stigman-watcher/|S' -C . dotenv-example -C $bin_dir stigman-watcher-linuxstatic
check_exit_status "Tarring linux Archive" 8

# Cleanup
rm -f sea-prep.blob bundle.cjs node-win.exe

printf "\n[BUILD_TASK] Done\n"
