#!/bin/bash

# This file is used to build binaries on a Linux device. It is not tested elsewhere, yet.
# Requires:
# - Node.js and module "pkg" (npm install -g pkg)
# - jq
# - zip
# - tar

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
npm install -g pkg

# Bundle
printf "[BUILD_TASK] Bundling\n"
npx esbuild index.js --bundle --platform=node --outfile=bundle.js
check_exit_status "Bundling" 1

# version=$(git describe --tags | sed 's/\(.*\)-.*/\1/')
#get version from package.json
version=$(jq -r .version package.json)
check_exit_status "Getting Version" 5
printf "\n[BUILD_TASK] Using version string: $version\n"

# Make binaries
printf "\n[BUILD_TASK] Building binaries in $bin_dir\n"
pkg -C gzip --public --public-packages=* --no-bytecode pkg.config.json
check_exit_status "Building Binaries" 2

# Windows archive
windows_archive=$dist_dir/stigman-watcher-win-$version.zip
printf "\n[BUILD_TASK] Creating $windows_archive\n"
zip --junk-paths $windows_archive ./dotenv-example $bin_dir/stigman-watcher-win.exe
check_exit_status "Zipping Windows Archive" 3

# Linux archive
linux_archive=$dist_dir/stigman-watcher-linux-$version.tar.gz
printf "\n[BUILD_TASK] Creating $linux_archive\n"
tar -czvf $linux_archive --xform='s|^|stigman-watcher/|S' -C . dotenv-example -C $bin_dir stigman-watcher-linuxstatic
check_exit_status "Tarring linux Archive" 4

printf "\n[BUILD_TASK] Done\n"
