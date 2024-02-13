import { expect } from 'chai'
import sinon from 'sinon'
import fs from 'fs'
import path from 'path'
import startScanner, {
  initHistory,
  getHistory,
  addToHistory,
  cancelQueue,
  removeFromHistory,
  exitSafely,
  flushWriteQueue
} from '../lib/scan.js'
import { logger } from '../lib/logger.js'

describe('testing add/remove/init functions  ', function () {
  const historyFile =
    './watcher.test.history'
  const path =
    './test/testFiles/test1'

  let logStub;

  this.beforeEach(function () {
    fs.writeFileSync(historyFile, '')
    logStub = sinon.stub(logger, 'info');
  })

  this.afterEach(function () {
    flushWriteQueue()
    fs.unlinkSync(historyFile)
    logStub.restore();
  })
  

  it('should correctly create an empty history file', async function () {
    this.timeout(5000)
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 15000,
      oneShot: true,
      historyCargoSize: 5,
      historyCargoDelay: 10000
    }

    initHistory(options)

    expect(fs.existsSync(historyFile)).to.be.true
    expect(fs.readFileSync(historyFile, 'utf8')).to.equal('')
  })

  it('should correctly add to history file', async function () {
    this.timeout(5000)
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 15000,
      oneShot: true,
      historyCargoSize: 1,
      historyCargoDelay: 10000
    }

    initHistory(options)

    //await startScanner(options)

    const file =
      './test/testFiles/test1/file1.ckl'

    addToHistory(file)

    await new Promise(resolve => setTimeout(resolve, 3000))

    const data = fs.readFileSync(historyFile, 'utf8')

    expect(data).to.equal(file + '\n')
  })

  it('should correctly remove from history file', async function () {
    this.timeout(5000)
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 15000,
      oneShot: true,
      historyCargoSize: 1,
      historyCargoDelay: 10000
    }

    initHistory(options)

    const file =
    './test/testFiles/test1/file1.ckl'

    addToHistory(file)

    await new Promise(resolve => setTimeout(resolve, 1000))

    removeFromHistory(file)

    await new Promise(resolve => setTimeout(resolve, 1000))

    const data = fs.readFileSync(historyFile, 'utf8')

    expect(data).to.equal('')
  })
})

describe('testing starting with empty history file and adding entries', function () {
  this.timeout(5000)
  const historyFile =
    './watcher.test.history'
  const path =
    './test/testFiles/test1'

    let logStub;
  this.beforeEach(function () {
    fs.writeFileSync(historyFile, '')
    logStub = sinon.stub(logger, 'info');
  })

  this.afterEach(function () {
    flushWriteQueue
    fs.unlinkSync(historyFile)
    logStub.restore();
  })

  it('should correctly identify new files and update the history file', async function () {
    this.timeout(5000)
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 15000,
      oneShot: true,
      historyCargoSize: 5,
      historyCargoDelay: 10000
    }

    // create history file
    await initHistory(options)

    // read the history file
    const data2 = fs.readFileSync(historyFile, 'utf8')

    // get files in scanned path var
    const files = fs.readdirSync(path)

    // start scanning
    await startScanner(options)

    // wait for queue to fire off and write to disk
    await new Promise(resolve => setTimeout(resolve, 2500))

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(5)

    const expectedHistoryEntries = [
      './test/testFiles/test1/file1.ckl',
      './test/testFiles/test1/file2.ckl',
      './test/testFiles/test1/file3.ckl',
      './test/testFiles/test1/file4.ckl',
      './test/testFiles/test1/file5.ckl'
    ]

    for (const entry of expectedHistoryEntries) {
      expect(lines).to.include(entry)
    }
  })
})


describe('testing finding intersection of history and scanned files in order to remove entries from historty file ', function () {
  this.timeout(5000)
  const historyFile =
    './watcher.test.history'
  const path =
    './test/testFiles/test1'

  let logStub;

  this.beforeEach(function () {
    const data = [
      './test/testFiles/test1/file1.ckl',
      './test/testFiles/test1/file2.ckl',
    ].join('\n');
    fs.writeFileSync(historyFile, data);
    logStub = sinon.stub(logger, 'info');
  })

  this.afterEach(function () {
    flushWriteQueue
    fs.unlinkSync(historyFile)
    logStub.restore();
  })

  it('should correctly identify new files and update the history file', async function () {
    this.timeout(5000)
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 15000,
      oneShot: true,
      historyCargoSize: 5,
      historyCargoDelay: 10000
    }

    // create history file
    await initHistory(options)

    // read the history file
    const data2 = fs.readFileSync(historyFile, 'utf8')
    const lines2 = data2.split('\n').filter(line => line.trim() !== '')

    // get files in scanned path var
    const files = fs.readdirSync(path)

    // start scanning
    await startScanner(options)

    // wait for queue to fire off and write to disk
    await new Promise(resolve => setTimeout(resolve, 2500))

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(5)

    const expectedHistoryEntries = [
      './test/testFiles/test1/file1.ckl',
      './test/testFiles/test1/file2.ckl',
      './test/testFiles/test1/file3.ckl',
      './test/testFiles/test1/file4.ckl',
      './test/testFiles/test1/file5.ckl'
    ]

    for (const entry of expectedHistoryEntries) {
      expect(lines).to.include(entry)
    }
  })
})
