import { expect } from "chai"
import * as lib from "./lib.js"
import fs from 'fs'
import path from 'node:path'

const BASE_CKL_PATH = "test/e2e/testFiles/test.ckl"
const BP_FILES_DIR = "test/e2e/bpFiles"
const FILE_COUNT = 200
const CARGO_SIZE = 5

describe("backpressure: bounded cargo depth under load", function () {
  this.timeout(300_000)
  let db, auth, api
  let watcher

  const env = {
    apiBase: "http://localhost:54001/api",
    authority: "http://localhost:8080",
    collectionId: "1",
    clientId: "stigman-watcher",
    clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
    path: BP_FILES_DIR,
    oneShot: true,
    mode: "scan",
    historyFile: "test/e2e/bp-history.txt",
    responseTimeout: 10000,
    historyWriteInterval: 10000,
    cargoDelay: 2000,
    logLevel: "verbose",
    cargoSize: CARGO_SIZE,
  }

  before(async function () {
    // create bpFiles directory
    if (!fs.existsSync(BP_FILES_DIR)) {
      fs.mkdirSync(BP_FILES_DIR, { recursive: true })
    }

    // generate CKL files with unique hostnames
    const promises = []
    for (let i = 0; i < FILE_COUNT; i++) {
      const hostName = `bp-host-${String(i).padStart(4, '0')}`
      const outputPath = path.join(BP_FILES_DIR, `${hostName}.ckl`)
      promises.push(lib.createCkl(BASE_CKL_PATH, outputPath, hostName))
    }
    await Promise.all(promises)

    // start infrastructure
    await lib.clearHistoryFileContents(env.historyFile)
    await lib.initNetwork()
    db = await lib.startDb()
    auth = await lib.startAuth()
    api = await lib.startApi()

    const { collection } = await lib.initWatcherTestCollection()
    env.collectionId = collection.collectionId
    await lib.uploadTestStig('VPN_STIG.xml')

    // run watcher and wait for it to finish
    watcher = await lib.runWatcherPromise({
      entry: "index.js",
      env,
      consoleLog: true,
      resolveOnClose: true,
      resolveOnMessage: `received shutdown event with code 0, exiting`
    })
  })

  after(async function () {
    lib.stopProcesses([api, auth, db])
    await lib.clearDirectory(BP_FILES_DIR)
    await lib.clearHistoryFileContents(env.historyFile)
  })

  it("should process all files successfully", function () {
    expect(
      watcher.logRecords.some(r => r.message === 'finished one shot mode')
    ).to.be.true
  })

  it("should have processed multiple batches", function () {
    const batchRecords = watcher.logRecords.filter(
      r => r.component === 'cargo' && r.message === 'batch started'
    )
    expect(batchRecords.length).to.be.at.least(10)
  })

  it("should keep cargoDepth bounded", function () {
    const batchRecords = watcher.logRecords.filter(
      r => r.component === 'cargo' && r.message === 'batch started'
    )
    const depths = batchRecords.map(r => r.cargoDepth)
    const maxDepth = Math.max(...depths)

    // With backpressure, max depth should be bounded to roughly
    // 2 * cargoSize (high-water mark) + headroom for concurrent parsers
    const bound = 2 * CARGO_SIZE + 20
    expect(maxDepth).to.be.at.most(
      bound,
      `max cargoDepth ${maxDepth} exceeded bound ${bound} (depths: ${depths.join(', ')})`
    )
  })
})
