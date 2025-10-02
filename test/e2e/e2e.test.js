import { setTimeout as delay } from "node:timers/promises"
import { expect } from "chai"
import * as lib from "./lib.js"
import { resolve as pathResolve } from 'node:path'
import fs from 'fs'
const BASE_CKL_PATH = "test/e2e/testFiles/test.ckl"

describe("setup and teardown", function () {

  before(async () => {
    // make scrapFiles dir if not exists
    if (!fs.existsSync("test/e2e/scrapFiles")) {
      fs.mkdirSync("test/e2e/scrapFiles", { recursive: true })
    }
  })

  after(async () => {
    // clean up scrapFiles dir
    lib.clearDirectory("test/e2e/scrapFiles")
    // clean up history file
    await lib.clearHistoryFileContents("test/e2e/e2e-history.txt")
  })

  describe("One shot Mode Scan mode, Single Ckl file processing.", async function () {
    this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/testFiles",
      oneShot: true,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 15,
    }
  
    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { user, collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcherPromise({ entry: "index.js", env,  resolveOnMessage: `received shutdown event with code 0, exiting`})
    })
    
    after(async () => {
      lib.stopProcesses([api, auth, db])
    })

    it("should log the correct startup message with config etc. ", async () => {

      expect(watcher.logRecords.some(r => r.message === `running`)).to.be.true
      const expectedOptions = {
        path: env.path,
        collectionId: env.collectionId,
        silent: false,
        logLevel: 'verbose',
        logFileLevel: 'verbose',
        mode: env.mode,
        historyFile: env.historyFile,
        logFile: false,
        api: env.apiBase,
        authority: env.authority,
        clientId: env.clientId,
        scopePrefix: '',
        addExisting: true,
        cargoDelay: env.cargoDelay,
        historyWriteInterval: env.historyWriteInterval,
        cargoSize: env.cargoSize,
        createObjects: true,
        eventPolling: true,
        stabilityThreshold: 0,
        oneShot: env.oneShot,
        logColor: false,
        debug: false,
        scanInterval: env.scanInterval,
        ignoreDot: true,
        strictRevisionCheck: false,
        responseTimeout: env.responseTimeout,
        _originalPath: env.path,
        _resolvedPath: pathResolve(process.cwd(), env.path),
        clientSecret: '[hidden]'
      }

      expect(watcher.logRecords.find(r => r.message === `running`).options).to.include(expectedOptions)
    })

    it("should complete preflight token process sucessfully", async () => {
      expect(watcher.logRecords.some(r => r.message === `preflight token request succeeded`)).to.be.true

      const expectedOidcRequest = {
        request: {
          method: 'GET',
          url: env.authority + '/.well-known/openid-configuration',
        },
        response: {
          status: 200,
          body: {
            issuer: env.authority,
            authorization_endpoint: env.authority + '/authorize',
            token_endpoint: env.authority + '/token',
            jwks_uri: env.authority + '/.well-known/jwks.json',
            end_session_endpoint: env.authority + '/logout',
            code_challenge_methods_supported: ['S256'],
            access_token: true,
            id_token: true
          }
        }
      }
      expect(watcher.logRecords.find(r => r.message === `http response`).request).to.deep.equal(expectedOidcRequest.request)
    })

    it("should Request for scap maps, the watched collection, stigs and the user", async () => {
      expect(watcher.logRecords.some(r => r.message === `preflight api requests succeeded`)).to.be.true

      const expectedRequestMethods = [
        {
          url: `${env.apiBase}/stigs/scap-maps`,
          response: 200
        },
        {
          url: `${env.apiBase}/collections/${env.collectionId}`,
          response: 200
        },
        {
          url: `${env.apiBase}/stigs`,
          response: 200
        },
        {
          url: `${env.apiBase}/user`,
          response: 200
        }
      ]

      const actualRequests = watcher.logRecords.filter(r => r.level === `http` && r.request.url.startsWith(env.apiBase))
      expect(actualRequests.length).to.be.at.least(expectedRequestMethods.length)

      expectedRequestMethods.forEach(expected => {
        const match = actualRequests.find(r => r.request.url === expected.url && r.response.status === expected.response)
        expect(match, `Expected request to ${expected.url} with response ${expected.response}`).to.exist
      })
    })

    it("should initalize a writable history file at path test/e2e/e2e-history.txt", async () => {
      expect(watcher.logRecords.some(r => r.message === `history file is writable, periodic writes enabled`)).to.be.true
      const initLog = watcher.logRecords.find(r => r.message === `history initialized from file`)
      expect(initLog.file).to.equal(env.historyFile)
    })

    it("It should start a scan of and process the single ckl file present in the test/e2e/testFiles folder", async () => {
      const expectedLogMessages = [
        {
          message: `scan started`,
          path: env.path
        },
        {
          message: "queued for parsing",
          file: env.path + "/test.ckl"
        },
        {
          message: "scan ended",
          path: env.path
        }]

      expectedLogMessages.forEach(expected => {
        const match = watcher.logRecords.find(r => r.message === expected.message && (expected.path ? r.path === expected.path : true) && (expected.file ? r.file === expected.file : true))
        expect(match, `Expected log message: ${expected.message} ${expected.path ? `with path ${expected.path}` : ''} ${expected.file ? `with file ${expected.file}` : ''}`).to.exist
      })
    })

    it("should log a parsed result from parser of the single ckl file", async () => {
      expect(watcher.logRecords.some(r => r.message === `results queued`)).to.be.true
      const resultLog = watcher.logRecords.find(r => r.message === `results queued`)
      expect(resultLog.target).to.equal("test")
      expect(resultLog.file).to.equal(env.path + "/test.ckl")
      expect(resultLog.checklists).to.exist
    })

    it("should start a cargo queue batch of id 1 and size 1", async () => {
      expect(watcher.logRecords.some(r => r.message === `batch started`)).to.be.true
      const batchLog = watcher.logRecords.find(r => r.message === `batch started`)
      expect(batchLog.batchId).to.equal(1)
      expect(batchLog.size).to.equal(1)
    })

    it("should request assets and stigs for the destination collection", async () => {
      const assetRequestLog = watcher.logRecords.find(r => r.request && r.request.url === `${env.apiBase}/assets?collectionId=1&projection=stigs`)
      expect(assetRequestLog).to.exist
      const assetDataLog = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset data received')
      expect(assetDataLog).to.exist
      expect(assetDataLog.size).to.equal(0)

      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received'), 10000)
      expect(watcher.logRecords.some(r => r.component === 'api' && r.message === 'query' && r.request && r.request.url === `${env.apiBase}/stigs`)).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received' && r.size === 1)).to.be.true
    })

    it("should create an asset and warn when there are no reviews to post", async () => {
      const created = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset created')
      expect(created).to.exist
      expect(created.asset).to.exist
      // basic sanity checks on asset structure
      expect(created.asset.name).to.include('test')
      expect(created.asset.collection && created.asset.collection.collectionId).to.equal(env.collectionId)

    const reviews = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'posted reviews')
    expect(reviews.length).to.equal(1)
    expect(reviews[0].asset.name).to.equal("test")
    })

    it("should add the CKL file to history and write the history file", async () => {
      const added = watcher.logRecords.find(r => r.component === 'scan' && r.message === 'added to history')
      expect(added).to.exist
      expect(Array.isArray(added.file)).to.be.true
      expect(added.file.some(f => f.endsWith('test.ckl'))).to.be.true

      // history file overwritten with memory
      const overwritten = watcher.logRecords.find(r => r.component === 'scan' && r.message === 'history file overwritten with history data from memory')
      expect(overwritten).to.exist
      expect(overwritten.file).to.equal(env.historyFile)

      // read history file to confirm it has the one entry
      const fileContents = fs.readFileSync(env.historyFile, 'utf8')
      const lines = fileContents.split('\n').filter(l => l.trim().length > 0)
      expect(lines.length).to.equal(1)
      const entry = lines[0]
      expect(entry).to.equal('test/e2e/testFiles/test.ckl')
    })

    it("should finish the batch, finish one-shot mode and shut down with code 0", async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended')).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'finished one shot mode')).to.be.true

      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 0/i.test(r.message))).to.be.true
    })
  })

  describe("Scan Mode One-shot — finds files 3 levels deep and processes them", async function () {
    this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: true,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 6,
    }

    before(async () => {
      // clean slate
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId

      // ensure scrapFiles is empty then create nested directories 3 levels deep
      lib.clearDirectory(env.path)
      const nestedBase = `${env.path}/level1/level2/level3`
      await fs.promises.mkdir(nestedBase, { recursive: true });

      // create three ckl files in the deepest directory
      await lib.createCkl(BASE_CKL_PATH, `${nestedBase}/nested1.ckl`, 'nested1')
      await lib.createCkl(BASE_CKL_PATH, `${nestedBase}/nested2.ckl`, 'nested2')
      await lib.createCkl(BASE_CKL_PATH, `${nestedBase}/nested3.ckl`, 'nested3')

      // upload the stig mappings the watcher will need
      await lib.uploadTestStig('VPN_STIG.xml')

      // run watcher and wait for graceful exit
      watcher = await lib.runWatcherPromise({ entry: 'index.js', env,  resolveOnMessage: `received shutdown event with code 0, exiting` })
    })

    after(async () => {
      lib.stopProcesses([api, auth, db])
      lib.clearDirectory(env.path)
    })

    it('starts and reports config', async () => {
      const running = watcher.logRecords.find(r => r.message === 'running')
      expect(running).to.exist
      expect(running.options).to.include({ path: env.path, oneShot: env.oneShot, cargoSize: env.cargoSize })
    })

    it('discovers and queues the 3 nested files', async () => {
      const queued = watcher.logRecords.filter(r => r.message === 'queued for parsing' && r.file && r.file.includes('/level1/level2/level3/'))
      expect(queued.length).to.equal(3)
      const names = queued.map(q => q.file.split('/').pop())
      expect(names).to.include('nested1.ckl')
      expect(names).to.include('nested2.ckl')
      expect(names).to.include('nested3.ckl')
    })

    it('creates assets for the nested files and posts reviews', async () => {
      const created = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'asset created' && r.asset && r.asset.name)
      // at least 3 assets created (one per nested file)
      expect(created.length).to.be.at.least(3)
      const createdNames = created.map(c => c.asset.name)
      expect(createdNames).to.include('nested1')
      expect(createdNames).to.include('nested2')
      expect(createdNames).to.include('nested3')
    })

    it('finishes one-shot and shuts down with code 0', async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'finished one shot mode')).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 0/i.test(r.message))).to.be.true
    })

  })

  describe("Event Mode One-shot — finds files 3 levels deep and processes them", async function () {
    this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: true,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 6,
    }

    before(async () => {
      // clean slate
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
     
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId

      // ensure scrapFiles is empty then create nested directories 3 levels deep
      lib.clearDirectory(env.path)
      const nestedBase = `${env.path}/level1/level2/level3`
      await fs.promises.mkdir(nestedBase, { recursive: true });

      // create three ckl files in the deepest directory
      await lib.createCkl(BASE_CKL_PATH, `${nestedBase}/nested1.ckl`, 'nested1')
      await lib.createCkl(BASE_CKL_PATH, `${nestedBase}/nested2.ckl`, 'nested2')
      await lib.createCkl(BASE_CKL_PATH, `${nestedBase}/nested3.ckl`, 'nested3')

      // upload the stig mappings the watcher will need
      await lib.uploadTestStig('VPN_STIG.xml')

      // run watcher and wait for graceful exit
      watcher = await lib.runWatcherPromise({ entry: 'index.js', env,  resolveOnMessage: `received shutdown event with code 0, exiting` })
    })

    after(async () => {
      lib.stopProcesses([api, auth, db])
      lib.clearDirectory(env.path)
    })

    it('starts and reports config', async () => {
      const running = watcher.logRecords.find(r => r.message === 'running')
      expect(running).to.exist
      expect(running.options).to.include({ path: env.path, oneShot: env.oneShot, cargoSize: env.cargoSize })
    })

    it('discovers and queues the 3 nested files', async () => {
      const queued = watcher.logRecords.filter(r => r.message === 'file system event' && r.file && r.file.includes('/level1/level2/level3/'))
      expect(queued.length).to.equal(3)
      const names = queued.map(q => q.file.split('/').pop())
      expect(names).to.include('nested1.ckl')
      expect(names).to.include('nested2.ckl')
      expect(names).to.include('nested3.ckl')
    })

    it('creates assets for the nested files and posts reviews', async () => {
      const created = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'asset created' && r.asset && r.asset.name)
      // at least 3 assets created (one per nested file)
      expect(created.length).to.be.at.least(3)
      const createdNames = created.map(c => c.asset.name)
      expect(createdNames).to.include('nested1')
      expect(createdNames).to.include('nested2')
      expect(createdNames).to.include('nested3')
    })

    it('finishes one-shot and shuts down with code 0', async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'finished one shot mode')).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 0/i.test(r.message))).to.be.true
    })

  })

  describe("One shot mode Scan, many files in nested structure with multiple batches", async function () {
    this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: true,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 2,
    }
  
    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId

      await lib.uploadTestStig('VPN_STIG.xml')
      for (let i = 1; i <= 5; i++) {
        await lib.createCkl(BASE_CKL_PATH, `test/e2e/scrapFiles/test${i}.ckl`, `test${i}`)
      }
      watcher = await lib.runWatcherPromise({ entry: "index.js", env,  resolveOnMessage: `received shutdown event with code 0, exiting`})
    })
    
    after(async () => {
      lib.stopProcesses([api, auth, db])
      lib.clearDirectory("test/e2e/scrapFiles")
    })

    it("Should log correct startup and config", async () => {
      const running = watcher.logRecords.find(r => r.message === 'running')
      expect(running).to.exist
      expect(running.options).to.include({
        path: env.path,
        oneShot: env.oneShot,
        cargoSize: env.cargoSize
      })
    })

    it("should run scan and detect 5 files in a non nested folder ", async () => {
      const queued = watcher.logRecords.filter(r => r.message === 'queued for parsing' && r.file && r.file.startsWith(env.path))
      expect(queued.length).to.equal(5)
      const fileNames = queued.map(q => q.file.split('/').pop())
      const expectedFileNames = ['test1.ckl','test2.ckl','test3.ckl','test4.ckl','test5.ckl']
      for (const fn of expectedFileNames) {
        expect(fileNames).to.include(fn)
      }
    })

    it("should add 5 task items to parsing queue", async () => {
      const queuedEvents = watcher.logRecords.filter(r => r.component === 'scan' && r.message === 'handling parseQueue event' && r.event === 'task_queued')
      expect(queuedEvents.length).to.be.at.least(5)
    })

    it("parse 5 items", async () => {
      const results = watcher.logRecords.filter(r => r.message === 'results queued')
      expect(results.length).to.be.at.least(5)
      const targets =  ['test1', 'test2', 'test3', 'test4', 'test5']
      for (const result of results) {
        expect(targets).to.include(result.target)
      }
    })

    it("should add 5 task items to cargo queue", async () => {
      const cargoQueued = watcher.logRecords.filter(r => r.component === 'scan' && r.message === 'handling cargoQueue event' && r.event === 'task_queued')
      expect(cargoQueued.length).to.be.at.least(5)
    })

    it("should run 3 batches of the cargo queue, 2 of 2 items and 1 of 1 item", async () => {
      const batches = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'batch started')
      expect(batches.length).to.equal(3)
      const batchIds = [1, 2, 3]
      const possibleSizes = [1,2]
      const sizes = batches.map(b => b.size)
      for (const size of sizes) {
        expect(possibleSizes).to.include(size)
      }
      for (const id of batchIds) {
        expect(batches.some(b => b.batchId === id)).to.be.true
      }

      const ended = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'batch ended')
      expect(ended.length).to.be.at.least(3)

      for(const id of batchIds) {
        expect(ended.some(e => e.batchId === id)).to.be.true
      }
    })

    it("should create 5 different assets", async () => {
      const created = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'asset created' && r.asset && r.asset.name)
      expect(created.length).to.be.at.least(5)
      const names = created.map(c => c.asset.name)
      const expected = ['test1','test2','test3','test4','test5']
      for (const name of expected) {
        expect(names).to.include(name)
      }
    })

    it("should see asset data and stig data received for each batch", async () => {
      // gather batch ids that started
      const batchIds = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'batch started').map(b => b.batchId)
      batchIds.forEach(id => {
        const a = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset data received' && r.batchId === id)
        const s = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'stig data received' && r.batchId === id)
        expect(a).to.exist
        expect(s).to.exist
      })
    })

    it("should have posted reviews for each asset", async () => {
      const reviews = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'posted reviews' && r.asset && r.asset.name)
      expect(reviews.length).to.be.at.least(5)
      const names = reviews.map(c => c.asset.name)
      const expected = ['test1','test2','test3','test4','test5']
      for (const name of expected) {
        expect(names).to.include(name)
      }
    })

    it("should write 5 entries to the history file", async () => {
      const added = watcher.logRecords.filter(r => r.component === 'scan' && r.message === 'added to history')
      expect(added.length).to.be.at.least(5)
      // collect file paths from the log entries
      const files = added.flatMap(a => Array.isArray(a.file) ? a.file : [a.file])
      const expectedFiles = ['test1.ckl','test2.ckl','test3.ckl','test4.ckl','test5.ckl']
      for (const fn of expectedFiles) {
        expect(files.some(f => f.endsWith(fn))).to.be.true
      }

      // check history file contents
      const fileContents = fs.readFileSync(env.historyFile, 'utf8')
      const lines = fileContents.split('\n').filter(l => l.trim().length > 0)
      expect(lines.length).to.equal(5)
      for (const fn of expectedFiles) {
        expect(lines.some(l => l.endsWith(fn))).to.be.true
      }

    })

    it("check shutdown message", async () => {
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 0/i.test(r.message))).to.be.true
    })
  })

  describe("Scan Mode, Drop in a file while running, then drop in another file for the same asset with new result to update review.", async function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 2,
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      lib.clearDirectory(env.path)
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
          // Wait for process to fully terminate
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
      lib.clearDirectory(env.path)
      // Additional delay to ensure complete cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))
    })

    it('starts running (non-promise watcher)', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 100000)
      expect(watcher.logRecords.some(r => r.message === 'running')).to.be.true
    })

    it('detects a dropped file after 10s and queues it for parsing', async () => {
      // wait a moment for watcher to stabilize then drop a file
      await delay(10000)
      await lib.createCkl(BASE_CKL_PATH, `${env.path}/dropped.ckl`, 'dropped')
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'queued for parsing' && r.file && r.file.endsWith('dropped.ckl')), 120000)
      expect(watcher.logRecords.some(r => r.message === 'queued for parsing' && r.file && r.file.endsWith('dropped.ckl'))).to.be.true
    })

    it('parses and queues results for the dropped file', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'results queued' && r.file && r.file.endsWith('dropped.ckl')), 120000)
      const res = watcher.logRecords.find(r => r.message === 'results queued' && r.file && r.file.endsWith('dropped.ckl'))
      expect(res).to.exist
      expect(res.target).to.equal('dropped')
    })

    it('processes the dropped file and adds to history', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'scan' && r.message === 'added to history' && Array.isArray(r.file) && r.file.some(f => f.endsWith('dropped.ckl'))), 120000)
      expect(watcher.logRecords.some(r => r.component === 'scan' && r.message === 'added to history' && Array.isArray(r.file) && r.file.some(f => f.endsWith('dropped.ckl')))).to.be.true
      // check for asset created log
      const created = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset created' && r.asset && r.asset.name === 'dropped')
      expect(created).to.exist

      // check for posted reviews log 
      const reviews = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'posted reviews' && r.asset && r.asset.name === 'dropped')
      expect(reviews.length).to.equal(1)
    })

    it('should drop a second file for the same asset with a different result', async () => {

      // get the original file's contents and modify a finding status
      const originalContents = fs.readFileSync(`${env.path}/dropped.ckl`, 'utf8')
      const modifiedContents = originalContents.replace(/<STATUS>NotAFinding<\/STATUS>/, '<STATUS>Open</STATUS>')

      // wait a moment then add the file as a new one with the modified contents
      await delay(5000)
      fs.writeFileSync(`${env.path}/dropped2.ckl`, modifiedContents, 'utf8')

      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'queued for parsing' && r.file && r.file.endsWith('dropped2.ckl')), 120000)
      expect(watcher.logRecords.some(r => r.message === 'queued for parsing' && r.file && r.file.endsWith('dropped2.ckl'))).to.be.true
    })

    it('parses and queues results for the second dropped file', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'results queued' && r.file && r.file.endsWith('dropped2.ckl')), 120000)
      const res = watcher.logRecords.find(r => r.message === 'results queued' && r.file && r.file.endsWith('dropped2.ckl'))
      expect(res).to.exist
      expect(res.target).to.equal('dropped')
    })

    it('processes the second dropped file and updates the asset and posts a second review', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'scan' && r.message === 'added to history' && Array.isArray(r.file) && r.file.some(f => f.endsWith('dropped2.ckl'))), 120000)
      expect(watcher.logRecords.some(r => r.component === 'scan' && r.message === 'added to history' && Array.isArray(r.file) && r.file.some(f => f.endsWith('dropped2.ckl')))).to.be.true
      // check for asset created log
      const created = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset created' && r.asset && r.asset.name === 'dropped')
      expect(created).to.exist

      // check for posted reviews log - should be a second one now
      const reviews = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'posted reviews' && r.asset && r.asset.name === 'dropped')
      expect(reviews.length).to.equal(2)

      // expect one of the reviews to have asset.affected.updated = 1 
      const updated = reviews.find(r => r.affected && r.affected.updated === 1)
      expect(updated).to.exist

    })
  })

  describe("Event Mode, Drop in a file while running", async function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/testFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 2,
      addExisting: true,
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it('starts running (non-promise watcher)', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 100000)
      expect(watcher.logRecords.some(r => r.message === 'running')).to.be.true
    })

    it("should watch the target folder", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'watching'), 20000)
      expect(watcher.logRecords.some(r => r.message === 'watching')).to.be.true
    })

    it("should find existing file due to add existing true", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'file system event'), 20000)
      expect(watcher.logRecords.some(r => r.message === 'file system event' && r.file && r.file.endsWith('test.ckl'))).to.be.true
    })

    it("should drop a file", async () => {
      // wait a moment for watcher to stabilize then drop a file
      await delay(5000)
      await lib.createCkl(BASE_CKL_PATH, `${env.path}/dropped.ckl`, 'dropped')

      // make sure the file is there
      const exists = fs.existsSync(`${env.path}/dropped.ckl`)
      expect(exists).to.be.true 
    })

    it("should get a file system event for the dropped file", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'events' && r.message === 'file system event' && r.file.endsWith('dropped.ckl' ), 70000))
      const log = watcher.logRecords.find(r => r.component === 'events' && r.message === 'file system event' && r.file.endsWith('dropped.ckl'))
      expect(log).to.exist
      expect(log.event).to.equal('add')
      expect(log.file).to.equal(`${env.path}/dropped.ckl`)
    })

    it('Should start a batch of size 1', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch started' && r.size === 2), 20000)
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch started' && r.size === 2)).to.be.true
    })

    it("should get asset and stig data for the batch", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'asset data received'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'asset data received')).to.be.true
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received')).to.be.true
    })

    it('processes the dropped file and adds to history', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended'), 20000)
      const created = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'asset created')
      const assetNames = ["test", "dropped"]
      expect(created.length).to.equal(2)
      for(const c of created) {
        expect(assetNames).to.include(c.asset.name)
      }

      // check for posted reviews log
      const reviews = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'posted reviews')
      expect(reviews.length).to.equal(2)
      for(const r of reviews) {
        expect(assetNames).to.include(r.asset.name)
      }
    })

    it("clean up dropped file", async () => {
      try {
        fs.unlinkSync(`${env.path}/dropped.ckl`)
      } catch(e) {}
    })
  })

  describe("Start in One shot mode with no files expect exit", async function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: true,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 15,
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { user, collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcherPromise({ entry: "index.js", env,  resolveOnMessage: `finished one shot mode - no work to do`})
    })
    

    after(async () => {
      lib.stopProcesses([api, auth, db])
    })


    it("should log the correct startup message with config etc. ", async () => {
      
      expect(watcher.logRecords.some(r => r.message === `running`)).to.be.true
      const expectedOptions = {
        path: env.path,
        collectionId: env.collectionId,
        silent: false,
        logLevel: 'verbose',
        logFileLevel: 'verbose',
        mode: env.mode,
        historyFile: env.historyFile,
        logFile: false,
        api: env.apiBase,
        authority: env.authority,
        clientId: env.clientId,
        scopePrefix: '',
        addExisting: true,
        cargoDelay: env.cargoDelay,
        historyWriteInterval: env.historyWriteInterval,
        cargoSize: env.cargoSize,
        createObjects: true,
        eventPolling: true,
        stabilityThreshold: 0,
        oneShot: env.oneShot,
        logColor: false,
        debug: false,
        scanInterval: env.scanInterval,
        ignoreDot: true,
        strictRevisionCheck: false,
        responseTimeout: env.responseTimeout,
        _originalPath: env.path,
        _resolvedPath: pathResolve(process.cwd(), env.path),
        clientSecret: '[hidden]'
      }

      expect(watcher.logRecords.find(r => r.message === `running`).options).to.include(expectedOptions)

    })

    it("should exit with code 0 and log finished one shot mode - no work to do", async () => {
      expect(watcher.logRecords.some(r => r.message === 'finished one shot mode - no work to do')).to.be.true
    })

  })

  describe("Scan Mode, should skip files in already in history", async function () {

    this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/testFiles",
      mode: "scan",
      oneShot: true,
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 15,
    }
  
    before(async () => {
      await lib.writeToHistoryFile(env.historyFile, ['test/e2e/testFiles/test.ckl'])
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
     
      const { user, collection } = await lib.initWatcherTestCollection()
      watcher = await lib.runWatcherPromise({ entry: "index.js", env: env,  resolveOnMessage: 'running' })
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcherPromise({ entry: "index.js", env,  resolveOnMessage: `received shutdown event with code 0, exiting`})
    })

    after(async () => {
      lib.stopProcesses([api, auth, db])
    })

    it("Should start up correctly", async () => {
      expect(watcher.logRecords.some(r => r.message === `running`)).to.be.true
    })

    it("Should scan and find a history match but not find any new files to process", async () => {
      expect(watcher.logRecords.some(r => r.message === `scan started`)).to.be.true
      expect(watcher.logRecords.some(r => r.message === `history match`)).to.be.true
      const matchLog = watcher.logRecords.find(r => r.message === `history match`)
      expect(matchLog.file).to.equal('test/e2e/testFiles/test.ckl')
      expect(watcher.logRecords.some(r => r.message === `scan ended`)).to.be.true
    })

    it("should log finished one shot mode - no work to do and exit with code 0", async () => {
      expect(watcher.logRecords.some(r => r.message === 'finished one shot mode - no work to do')).to.be.true
    })

  })

  describe("Scan Mode, One shot, should not find the stig accociated with the asset because its not in the api", async function () {
    this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/testFiles",
      oneShot: true,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 15,
    }
  
    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { user, collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      watcher = await lib.runWatcherPromise({ entry: "index.js", env,  resolveOnMessage: `received shutdown event with code 0, exiting`})
    })
    

    after(async () => {
      lib.stopProcesses([api, auth, db])
    })

    it("should log the correct startup message with config etc. ", async () => {

      expect(watcher.logRecords.some(r => r.message === `running`)).to.be.true
      const expectedOptions = {
        path: env.path,
        collectionId: env.collectionId,
        silent: false,
        logLevel: 'verbose',
        logFileLevel: 'verbose',
        mode: env.mode,
        historyFile: env.historyFile,
        logFile: false,
        api: env.apiBase,
        authority: env.authority,
        clientId: env.clientId,
        scopePrefix: '',
        addExisting: true,
        cargoDelay: env.cargoDelay,
        historyWriteInterval: env.historyWriteInterval,
        cargoSize: env.cargoSize,
        createObjects: true,
        eventPolling: true,
        stabilityThreshold: 0,
        oneShot: env.oneShot,
        logColor: false,
        debug: false,
        scanInterval: env.scanInterval,
        ignoreDot: true,
        strictRevisionCheck: false,
        responseTimeout: env.responseTimeout,
        _originalPath: env.path,
        _resolvedPath: pathResolve(process.cwd(), env.path),
        clientSecret: '[hidden]'
      }

      expect(watcher.logRecords.find(r => r.message === `running`).options).to.include(expectedOptions)
    })

    it("should request assets and stigs for the destination collection", async () => {
      const assetRequestLog = watcher.logRecords.find(r => r.request && r.request.url === `${env.apiBase}/assets?collectionId=1&projection=stigs`)
      expect(assetRequestLog).to.exist
      const assetDataLog = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset data received')
      expect(assetDataLog).to.exist
      expect(assetDataLog.size).to.equal(0)

      expect(watcher.logRecords.some(r => r.component === 'api' && r.message === 'query' && r.request && r.request.url === `${env.apiBase}/stigs`)).to.be.true
      // no stigs in the api so size should be 0
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received' && r.size === 0)).to.be.true
    })

    it("should create an asset and warn when there are no reviews to post", async () => {
      const created = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset created')
      expect(created).to.exist
      expect(created.asset).to.exist
      // basic sanity checks on asset structure
      expect(created.asset.name).to.include('test')
      expect(created.asset.collection && created.asset.collection.collectionId).to.equal(env.collectionId)

      // warn no reviews to post
      const noReviewsLog = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'no reviews to post')
      expect(noReviewsLog.length).to.equal(1)
    })

    it("should add the CKL file to history and write the history file", async () => {
      const added = watcher.logRecords.find(r => r.component === 'scan' && r.message === 'added to history')
      expect(added).to.exist
      expect(Array.isArray(added.file)).to.be.true
      expect(added.file.some(f => f.endsWith('test.ckl'))).to.be.true

      // history file overwritten with memory
      const overwritten = watcher.logRecords.find(r => r.component === 'scan' && r.message === 'history file overwritten with history data from memory')
      expect(overwritten).to.exist
      expect(overwritten.file).to.equal(env.historyFile)

      // read history file to confirm it has the one entry
      const fileContents = fs.readFileSync(env.historyFile, 'utf8')
      const lines = fileContents.split('\n').filter(l => l.trim().length > 0)
      expect(lines.length).to.equal(1)
      const entry = lines[0]
      expect(entry).to.equal('test/e2e/testFiles/test.ckl')
    })

    it("should finish the batch, finish one-shot mode and shut down with code 0", async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended')).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'finished one shot mode')).to.be.true

      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 0/i.test(r.message))).to.be.true
    })
  })

  describe("Event Mode, One shot, should not create new objects", async function () {
  this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/testFiles",
      oneShot: true,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      noCreateObjects: true,
      logLevel: "verbose",
      cargoSize: 2,
      addExisting: true,
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
    
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcherPromise({ entry: "index.js", env,  resolveOnMessage: `received shutdown event with code 0, exiting`})
    })

    after(async () => {
      lib.stopProcesses([api, auth, db])
    })

    it('starts running (non-promise watcher)', async () => {
      expect(watcher.logRecords.some(r => r.message === 'running')).to.be.true
    })

    it("should watch the target folder", async () => {
      expect(watcher.logRecords.some(r => r.message === 'watching')).to.be.true
    })

    it("should find existing file due to add existing true", async () => {
      expect(watcher.logRecords.some(r => r.message === 'file system event' && r.file && r.file.endsWith('test.ckl'))).to.be.true
    })
    
    it('Should start a batch of size 1', async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch started' && r.size === 1)).to.be.true
    })

    it("should get asset and stig data for the batch", async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'asset data received')).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received')).to.be.true
      // should find no assets existing in the api and a single stig
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'asset data received' && r.size === 0)).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received' && r.size === 1)).to.be.true
    })

    it("should NOT see a log entry for asset created", async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'asset created')).to.be.false
    })

    it('should finish the batch, finish one-shot mode and shut down with code 0', async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended')).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'finished one shot mode')).to.be.true
    })
  })

  describe("Test Ignore Glob / Ignore Dot, Should not scan any files in the ignoreTest folder should scan dot files.", async function () {

  this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: true,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      scanInterval: 60000,
      cargoDelay: 20000, // not used in oneShot 
      ignoreGlob: ["**/ignoreTest/**"],
      noIgnoreDot: true,
      logLevel: "verbose",
      cargoSize: 5,
    }
  
    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
     
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId

      await lib.uploadTestStig('VPN_STIG.xml')
      for (let i = 1; i <= 5; i++) {
        // these are dot files 
        await lib.createCkl(BASE_CKL_PATH, `test/e2e/scrapFiles/.test${i}.ckl`, `test${i}`)
      }
      // create the ignoreTest folder that is inside the scapFiles folder and add files that should be ignored
      const ignorePath = 'test/e2e/scrapFiles/ignoreTest'
      if (!fs.existsSync(ignorePath)){
        fs.mkdirSync(ignorePath);
      }
      for (let i = 1; i <= 5; i++) {
        await lib.createCkl(BASE_CKL_PATH, `${ignorePath}/ignore${i}.ckl`, `ignore${i}`)
      }

      watcher = await lib.runWatcherPromise({ entry: "index.js", env,  resolveOnMessage: `received shutdown event with code 0, exiting`})
    })
    
    after(async () => {
      lib.stopProcesses([api, auth, db])
      lib.clearDirectory("test/e2e/scrapFiles")
    })

    it("Should log correct startup and config", async () => {
      const running = watcher.logRecords.find(r => r.message === 'running')
      expect(running).to.exist
      expect(running.options).to.include({
        path: env.path,
        oneShot: env.oneShot,
        cargoSize: env.cargoSize
      })
    })

    it("should run scan and detect 5 files in a non nested folder ", async () => {
      const queued = watcher.logRecords.filter(r => r.message === 'queued for parsing' && r.file && r.file.startsWith(env.path))
      expect(queued.length).to.equal(5)
      const fileNames = queued.map(q => q.file.split('/').pop())
      const expectedFileNames = ['.test1.ckl','.test2.ckl','.test3.ckl','.test4.ckl','.test5.ckl']
      for (const fn of expectedFileNames) {
        expect(fileNames).to.include(fn)
      }
    })

    it("should NOT detect any files in the ignoreTest folder", async () => {
      const ignored = watcher.logRecords.filter(r => r.message === 'queued for parsing' && r.file && r.file.includes('/ignoreTest/'))
      expect(ignored.length).to.equal(0)
    })


    it("should add 5 task items to parsing queue", async () => {
      const queuedEvents = watcher.logRecords.filter(r => r.component === 'scan' && r.message === 'handling parseQueue event' && r.event === 'task_queued')
      expect(queuedEvents.length).to.be.at.least(5)
    })

    it("parse 5 items", async () => {
      const results = watcher.logRecords.filter(r => r.message === 'results queued')
      expect(results.length).to.be.at.least(5)
      const targets =  ['test1', 'test2', 'test3', 'test4', 'test5']
      for (const result of results) {
        expect(targets).to.include(result.target)
      }
    })

    it("should create 5 different assets", async () => {
      const created = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'asset created' && r.asset && r.asset.name)
      expect(created.length).to.be.at.least(5)
      const names = created.map(c => c.asset.name)
      const expected = ['test1','test2','test3','test4','test5']
      for (const name of expected) {
        expect(names).to.include(name)
      }
    })

    it("should write 5 entries to the history file", async () => {
      const added = watcher.logRecords.filter(r => r.component === 'scan' && r.message === 'added to history')
      expect(added.length).to.be.at.least(5)
      // collect file paths from the log entries
      const files = added.flatMap(a => Array.isArray(a.file) ? a.file : [a.file])
      const expectedFiles = ['.test1.ckl','.test2.ckl','.test3.ckl','.test4.ckl','.test5.ckl']
      for (const fn of expectedFiles) {
        expect(files.some(f => f.endsWith(fn))).to.be.true
      }

      // check history file contents
      const fileContents = fs.readFileSync(env.historyFile, 'utf8')
      const lines = fileContents.split('\n').filter(l => l.trim().length > 0)
      expect(lines.length).to.equal(5)
      for (const fn of expectedFiles) {
        expect(lines.some(l => l.endsWith(fn))).to.be.true
      }

    })

    it("check shutdown message", async () => {
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 0/i.test(r.message))).to.be.true
    })

  })

  describe("Should create new asset Stig associations for an existing asset. ", async function () {
    this.timeout(180_000)
    let db, auth, api
    let watcher

    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/testFiles",
      oneShot: true,
      mode: "events",
      addExisting: true,
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 6,
    }

    before(async () => {
      // clean slate
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
     
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      // create asset that the files will match on but it has no stigs associated
      await lib.createAsset(null, collection.collectionId)
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcherPromise({ entry: 'index.js', env,  resolveOnMessage: `received shutdown event with code 0, exiting` })
    })

    after(async () => {
      lib.stopProcesses([api, auth, db])
    })

    it('starts and reports config', async () => {
      const running = watcher.logRecords.find(r => r.message === 'running')
      expect(running).to.exist
      expect(running.options).to.include({ path: env.path, oneShot: env.oneShot, cargoSize: env.cargoSize })
    })

    it('discovers and queues the test file for asset named test', async () => {
      const queued = watcher.logRecords.filter(r => r.message === 'file system event' && r.file && r.file.includes('test.ckl'))
      expect(queued.length).to.equal(1)
      const queueLog = queued[0]
      expect(queueLog.event).to.equal('add')
      expect(queueLog.file).to.equal('test/e2e/testFiles/test.ckl')
    })

    it("it should ask for assets and stigs and see the existing asset and single stig in api", async () => {
      const assetRequestLog = watcher.logRecords.find(r => r.request && r.request.url === `${env.apiBase}/assets?collectionId=${env.collectionId}&projection=stigs`)
      expect(assetRequestLog).to.exist
      const assetDataLog = watcher.logRecords.find(r => r.component === 'cargo' && r.message === 'asset data received')
      expect(assetDataLog).to.exist
      expect(assetDataLog.size).to.equal(1) // should find the existing asset

      expect(watcher.logRecords.some(r => r.component === 'api' && r.message === 'query' && r.request && r.request.url === `${env.apiBase}/stigs`)).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'stig data received' && r.size === 1)).to.be.true
    })

    it("should update stig assignments for the existing asset", async () => {
      const updated = watcher.logRecords.find(r => r.component === 'cargo' && r.message === "STIG assignments updated")
      expect(updated).to.exist
      expect(updated.asset).to.exist
      expect(updated.asset.name).to.equal('test')
      expect(updated.asset.stigs && Array.isArray(updated.asset.stigs) && updated.asset.stigs.length).to.equal(1)
      const stig = updated.asset.stigs[0]
      expect(stig).to.exist
      expect(stig).to.equal('VPN_SRG_TEST')
    })

    it("Should post reviews for the asset", async () => {
      const reviews = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'posted reviews')
      expect(reviews.length).to.equal(1)
      const reviewLog = reviews[0]
      expect(reviewLog.asset).to.exist
      expect(reviewLog.asset.name).to.equal('test')
      expect(reviewLog.affected.inserted).to.eql(1)
    })

    it('finishes one-shot and shuts down with code 0', async () => {
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'finished one shot mode')).to.be.true
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 0/i.test(r.message))).to.be.true
    })

  })

  describe("Event Mode, start normal, take down auth service, go offline, bring auth back up and continue.", async function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      addExisting: true,
      cargoSize: 2,
    }


    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.clearDirectory(env.path)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      auth.clientCredentialsLifetime = 10 // make tokens short lived to force a refresh during the test
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it("should start up normally then stop the api service and raise alarm auth offline", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'preflight api requests succeeded'), 120000)

      await delay(12000)
      await auth.stop()

      for (let i = 1; i <= 2; i++) {
        await lib.createCkl(BASE_CKL_PATH, `${env.path}/api-offline${i}.ckl`, `api-offline${i}`)
      }
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline'), 120000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline')).to.be.true
    })

    it("restarts the auth service", async () => {
      auth = await lib.startAuth()
    })
    
    it("waits for auth to come back online", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: authOffline'), 120000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: authOffline')).to.be.true
    })

  })

  describe("Scan Mode, start normal, take down auth service, go offline, bring auth back up and continue.", async function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      scanInterval: 60000,
      cargoSize: 2,
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.clearDirectory(env.path)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      auth.clientCredentialsLifetime = 10 // make tokens short lived to force a refresh during the test
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it("should start up normally then stop the api service and raise alarm auth offline", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'preflight api requests succeeded'), 20000)

      await auth.stop()

      for (let i = 1; i <= 2; i++) {
        await lib.createCkl(BASE_CKL_PATH, `${env.path}/api-offline${i}.ckl`, `api-offline${i}`)
      }
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline'), 100000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline')).to.be.true
    })

    it("restarts the auth service", async () => {
      auth = await lib.startAuth()
    })
    
    it("waits for auth to come back online", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: authOffline'), 120000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: authOffline')).to.be.true
    })

    it("wait for batch id 2 (retrying the original failed batch)", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended' && r.batchId === 2), 120000)
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended' && r.batchId === 2)).to.be.true
    })

    it("should create assets for the 2 files", async () => {
      const created = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'asset created' )
      expect(created.length).to.be.at.least(2)
      const names = created.map(c => c.asset.name)
      const expected = ['api-offline1','api-offline2']
      for (const name of expected) {
        expect(names).to.include(name)
      }
    })

  })

  describe("Event Mode, stop api and go api offline, come back up, then take api back down and eventually exit", async function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      addExisting: true,
      cargoSize: 2,
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.clearDirectory(env.path)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
     
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    
    it("should start up normally then stop the api service and raise alarm api offline", async () => {
      // ensure watcher finished start/preflight and is running
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 20000)
      
      for (let i = 1; i <= 2; i++) {
        await lib.createCkl(BASE_CKL_PATH, `${env.path}/api-offline${i}.ckl`, `api-offline${i}`)
      }
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'preflight api requests succeeded'), 20000)
      api.stop()
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline')).to.be.true
    })

    it("restarts the api service", async () => {
      api = await lib.startApi()
    })
    
    it("waits for api to come back online", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: apiOffline'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: apiOffline')).to.be.true
    })
  })

  describe("Scan Mode, stop api and go api offline, come back up and process the failed batch ", async function () {
    this.timeout(200_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      scanInterval: 60000,    
      cargoDelay: 7000,
      logLevel: "verbose",
      cargoSize: 2,
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()

      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it("stops the api service", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 200000)
      
      for (let i = 1; i <= 2; i++) {
        try {
          await lib.createCkl(BASE_CKL_PATH, `${env.path}/api-offline${i}.ckl`, `api-offline${i}`)
        } catch (e) {}
      }
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'preflight api requests succeeded'), 200000)
      await api.stop()
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline'), 200000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline')).to.be.true
    })

    it("restarts the api service", async () => {
      api = await lib.startApi()
    })
    
    it("waits for api to come back online", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: apiOffline'), 2002200)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: apiOffline')).to.be.true
    })

    it("wait for batch id 2 (retrying the original failed batch)", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended' && r.batchId === 2), 120000)
      expect(watcher.logRecords.some(r => r.component === 'cargo' && r.message === 'batch ended' && r.batchId === 2)).to.be.true
    })

    it("should create assets for the 2 files", async () => {
      const created = watcher.logRecords.filter(r => r.component === 'cargo' && r.message === 'asset created' && r.asset && r.asset.name)
      expect(created.length).to.be.at.least(2)
      const names = created.map(c => c.asset.name)
      const expected = ['api-offline1','api-offline2']
      for (const name of expected) {
        expect(names).to.include(name)
      }
    })
  })

  describe("Start watcher without an API eventually exit", function () {

    this.timeout(120_000)
    let db, auth
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      addExisting: true,
      cargoSize: 2,
      retryCount: 3,
      retryDelay: 2000,
    }

    before(async () => {
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      watcher = await lib.runWatcherPromise({ entry: 'index.js', env: env, })
    })

    after(async () => {
      lib.stopProcesses([auth, db])
    })

    it("should start up and try to connect to the api and raise alarm apiOffline", async () => {
      // ensure watcher finished start/preflight and is running
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 20000)
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline')).to.be.true
    })

    it("should retry to connect to api service 3 times and eventually exit with code 1", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 1/i.test(r.message)), 200020)
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 1/i.test(r.message))).to.be.true
    })
  })

  describe("Start watcher without an auth service eventually exit", function () {

    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      addExisting: true,
      cargoSize: 2,
      retryCount: 3,
      retryDelay: 2000,
    }

    before(async () => {
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()

      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      await auth.stop()
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, db])
    })

    it("should start up and try to connect to the api and raise alarm authOffline", async () => {
      // ensure watcher finished start/preflight and is running
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 20000)
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline')).to.be.true
    })

    it("should retry to connect to aujth service 3 times and eventually exit with code 2", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 2/i.test(r.message)), 200020)
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 2/i.test(r.message))).to.be.true
    })
  })

  describe("should start watcher without auth service, then start auth and recover", function () {

    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: true,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      addExisting: true,
      cargoSize: 2,
      retryCount: 20,
      retryDelay: 2000,
    }

    before(async () => {
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()

      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      await auth.stop()
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it("should start up and try to connect to the api and raise alarm authOffline", async () => {
      // ensure watcher finished start/preflight and is running
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 20000)
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline')).to.be.true
    })

    it("should start the auth service", async () => {
      auth = await lib.startAuth()
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: authOffline'), 120000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm lowered: authOffline')).to.be.true
    })


    it("Should succesfully complete preflight services check", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'preflight api requests succeeded'), 120000)
      expect(watcher.logRecords.some(r => r.message === 'preflight api requests succeeded')).to.be.true
    })

    it("should finish one-shot and exit with code 0", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'finished one shot mode - no files found'), 120000)
      expect(watcher.logRecords.some(r => r.message === 'finished one shot mode - no files found')).to.be.true
    })
    
  })

  describe("Start watcher against a non existent collection (stimulates noGrant alarm)", function () {


    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "999",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      addExisting: true,
      cargoSize: 2,
    }

    before(async () => {
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it("should start up and try to connect to the api and raise alarm noGrant", async () => {
      // ensure watcher finished start/preflight and is running
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 20000)
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: noGrant'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: noGrant')).to.be.true
    })
  })

  describe("Should raise noToken alarm when auth is reachable but no token is provided", function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "secret",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      addExisting: true,
      cargoSize: 2,
    }

    before(async () => {
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      const { collection } = await lib.initWatcherTestCollection() // create a collection but do not give the watcher access to it
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })


    it("should start up and try to connect to the api and raise alarm noToken", async () => {
      // ensure watcher finished start/preflight and is running
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 20000)
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: noToken'), 20000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: noToken')).to.be.true
    })

  })

  describe("Event Mode, cargo size 5, single file with cargo delay drain test", async function () {
    this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      cargoDelay: 8000, // 5 second cargo delay
      logLevel: "verbose",
      cargoSize: 5, // Set cargo size to 5
      addExisting: false, // Don't process existing files
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.clearDirectory(env.path)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
    
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
      lib.clearDirectory(env.path)
    })

    it('starts running and begins watching', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 30000)
      expect(watcher.logRecords.some(r => r.message === 'running')).to.be.true
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'watching'), 20000)
      expect(watcher.logRecords.some(r => r.message === 'watching')).to.be.true
    })

    it('should drop a single file and detect it', async () => {
      await lib.createCkl(BASE_CKL_PATH, `${env.path}/cargo-test.ckl`, 'cargo-test')
      
      // Wait for file system event
      await lib.waitFor(() => watcher.logRecords.some(r => 
        r.component === 'events' && 
        r.message === 'file system event'), 30000)
      
      const fsEvent = watcher.logRecords.find(r => 
        r.component === 'events' && 
        r.message === 'file system event' && 
        r.file && r.file.endsWith('cargo-test.ckl')
      )
      expect(fsEvent).to.exist
      expect(fsEvent.event).to.equal('add')
    })

  
    it('should parse and queue results for the file', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => 
        r.message === 'results queued' && 
        r.file && r.file.endsWith('cargo-test.ckl')
      ), 30000)
      
      const result = watcher.logRecords.find(r => 
        r.message === 'results queued' && 
        r.file && r.file.endsWith('cargo-test.ckl')
      )
      expect(result).to.exist
      expect(result.target).to.equal('cargo-test')
    })

    it('should start a batch after cargo delay timeout (5 seconds)', async () => {
      // Wait for cargo delay to trigger batch processing
      await lib.waitFor(() => watcher.logRecords.some(r => 
        r.component === 'cargo' && 
        r.message === 'batch started'
      ), 20000) 
      
      const batchStart = watcher.logRecords.find(r => 
        r.component === 'cargo' && 
        r.message === 'batch started'
      )
      expect(batchStart).to.exist
      expect(batchStart.size).to.equal(1) 
      expect(batchStart.batchId).to.equal(1) 
    })

    it('should process the batch and complete successfully', async () => {
      // Wait for asset and stig data
      await lib.waitFor(() => watcher.logRecords.some(r => 
        r.component === 'cargo' && 
        r.message === 'asset data received'
      ), 30000)
      expect(watcher.logRecords.some(r => 
        r.component === 'cargo' && 
        r.message === 'asset data received'
      )).to.be.true

      await lib.waitFor(() => watcher.logRecords.some(r => 
        r.component === 'cargo' && 
        r.message === 'stig data received'
      ), 30000)
      expect(watcher.logRecords.some(r => 
        r.component === 'cargo' && 
        r.message === 'stig data received'
      )).to.be.true

      // Wait for batch to end
      await lib.waitFor(() => watcher.logRecords.some(r => 
        r.component === 'cargo' && 
        r.message === 'batch ended' && 
        r.batchId === 1
      ), 30000)
      
      const batchEnd = watcher.logRecords.find(r => 
        r.component === 'cargo' && 
        r.message === 'batch ended' && 
        r.batchId === 1
      )
      expect(batchEnd).to.exist
    })

    it('should create the asset and post reviews', async () => {
      // Check for asset creation
      const assetCreated = watcher.logRecords.find(r => 
        r.component === 'cargo' && 
        r.message === 'asset created' && 
        r.asset && r.asset.name === 'cargo-test'
      )
      expect(assetCreated).to.exist

      // Check for posted reviews
      const reviewsPosted = watcher.logRecords.find(r => 
        r.component === 'cargo' && 
        r.message === 'posted reviews' && 
        r.asset && r.asset.name === 'cargo-test'
      )
      expect(reviewsPosted).to.exist
    })

  })

  describe("Should Start up normally, Take down API, go api offline and eventually exit on retry count reached", function () {

    this.timeout(180_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      cargoDelay: 8000, // 5 second cargo delay
      logLevel: "verbose",
      cargoSize: 5, // Set cargo size to 5
      addExisting: false, // Don't process existing files
      retryCount: 2, // Set low retry count for test
      retryDelay: 3000, // 3 second retry delay
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()

      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })
    
    it('starts running and begins watching', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'running'), 30000)
      expect(watcher.logRecords.some(r => r.message === 'running')).to.be.true
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'watching'), 20000)
      expect(watcher.logRecords.some(r => r.message === 'watching')).to.be.true
    })

    it("should stop the api service", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'preflight api requests succeeded'), 30000)
      await api.stop()
    })

    it('should drop a single file and detect it', async () => {
      await lib.createCkl(BASE_CKL_PATH, `${env.path}/api-exit-test.ckl`, 'api-exit-test')
      
      // Wait for file system event
      await lib.waitFor(() => watcher.logRecords.some(r => 
        r.component === 'events' && 
        r.message === 'file system event'), 30000)
      
      const fsEvent = watcher.logRecords.find(r => 
        r.component === 'events' && 
        r.message === 'file system event' && 
        r.file && r.file.endsWith('api-exit-test.ckl')
      )
      expect(fsEvent).to.exist
      expect(fsEvent.event).to.equal('add')
    })

    it("should raise apiOffline alarm", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline'), 60000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: apiOffline')).to.be.true
    })

    
    it("should retry 2 times at 3 seconds between retries and exit", async () => {
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 1/i.test(r.message)), 120000)
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 1/i.test(r.message))).to.be.true
      
      const apiRetryLogs = watcher.logRecords.filter(r => r.component === 'api' && r.message === "Testing if API is online")
      expect(apiRetryLogs.length).to.equal(env.retryCount)

      const APImaxRetryLog = watcher.logRecords.filter(r => r.component === 'api' && r.message === "API connectivity maximum tries reached, requesting shutdown")
      expect(APImaxRetryLog.length).to.equal(1)
      expect(APImaxRetryLog[0].attempts).to.equal(env.retryCount)
      

    })
  })

  describe("Should Start up normally, Take down Auth, go auth offline and eventually exit on retry count reached", function () {
  this.timeout(120_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "scan",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 5000,
      historyWriteInterval: 10000,
      cargoDelay: 7000,
      logLevel: "verbose",
      scanInterval: 60000,
      cargoSize: 2,
      retryCount: 2, // Set low retry count for test
      retryDelay: 7000, // 7 second retry delay
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.clearDirectory(env.path)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()
      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      auth.clientCredentialsLifetime = 10 // make tokens short lived to force a refresh during the test
      watcher = await lib.runWatcher({ entry: 'index.js', env: env, })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it("should start up normally then stop the auth service and raise alarm auth offline", async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'preflight api requests succeeded'), 20000)

      await auth.stop()

      for (let i = 1; i <= 2; i++) {
        await lib.createCkl(BASE_CKL_PATH, `${env.path}/api-offline${i}.ckl`, `api-offline${i}`)
      }
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline'), 100000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline')).to.be.true
    })

    it("should retry 2 times at 3 seconds between retries and exit", async () => {
      
      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 2/i.test(r.message)), 120000)
      expect(watcher.logRecords.some(r => r.component === 'index' && /shutdown event with code 2/i.test(r.message))).to.be.true

      const authRetryLogs = watcher.logRecords.filter(r => r.component === 'auth' && r.message === "Testing if OIDC Provider is online")
      expect(authRetryLogs.length).to.equal(env.retryCount)
      const authMaxRetryLog = watcher.logRecords.filter(r => r.component === 'auth' && r.message === "OIDC Provider connectivity maximum tries reached, requesting shutdown")
      expect(authMaxRetryLog.length).to.equal(1)
      expect(authMaxRetryLog[0].attempts).to.equal(env.retryCount)
    })
  })

  describe("Should retry indefinitely (retryCount=0) and make at least 10 attempts (for testing sake stop at 10)", function () {
    this.timeout(180_000)
    let db, auth, api
    let watcher
    const env = {
      apiBase: "http://localhost:54001/api",
      authority: `http://localhost:8080`,
      collectionId: "1",
      clientId: "stigman-watcher",
      clientSecret: "954fd71a-dad6-47ab-8035-060268f3d396",
      path: "test/e2e/scrapFiles",
      oneShot: false,
      mode: "events",
      historyFile: "test/e2e/e2e-history.txt",
      responseTimeout: 10000,
      historyWriteInterval: 10000,
      cargoDelay: 8000,
      logLevel: "verbose",
      cargoSize: 5,
      addExisting: false,
      retryCount: 0, // retry forever
      retryInterval: 2000 // 2 second retry interval
    }

    before(async () => {
      await lib.clearHistoryFileContents(env.historyFile)
      await lib.clearDirectory(env.path)
      await lib.initNetwork()
      db = await lib.startDb()
      auth = await lib.startAuth()
      api = await lib.startApi()

      const { collection } = await lib.initWatcherTestCollection()
      env.collectionId = collection.collectionId
      await lib.uploadTestStig('VPN_STIG.xml')
      // short lived tokens so watcher will need to refresh while auth is stopped
      auth.clientCredentialsLifetime = 2
      watcher = await lib.runWatcher({ entry: 'index.js', env: env })
    })

    after(async () => {
      try {
        if (watcher && watcher.process) {
          watcher.process.kill()
        }
      } catch (e) {}
      lib.stopProcesses([api, auth, db])
    })

    it('starts running and then retries indefinitely (observe at least 10 retries)', async () => {
      await lib.waitFor(() => watcher.logRecords.some(r => r.message === 'watching'), 20000)
      expect(watcher.logRecords.some(r => r.message === 'watching')).to.be.true

      // stop auth to trigger authOffline and retries
      await auth.stop()

      for (let i = 1; i <= 2; i++) {
        await lib.createCkl(BASE_CKL_PATH, `${env.path}/api-offline${i}.ckl`, `api-offline${i}`)
      }

      await lib.waitFor(() => watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline'), 60000)
      expect(watcher.logRecords.some(r => r.component === 'index' && r.message === 'Alarm raised: authOffline')).to.be.true

      // wait until we have recorded at least 10 retry attempts
      await lib.waitFor(() => {
        const authRetryLogs = watcher.logRecords.filter(r => r.component === 'auth' && r.message === 'Testing if OIDC Provider is online')
        return authRetryLogs.length >= 10
      }, 120000)

      const authRetryLogs = watcher.logRecords.filter(r => r.component === 'auth' && r.message === 'Testing if OIDC Provider is online')
      expect(authRetryLogs.length).to.be.at.least(10)
    })
  })
})

