import { expect } from 'chai'
import sinon from 'sinon'
import fs from 'fs'
import startScanner, {
  initHistory,
  addToHistory,
  removeFromHistory,
  setHistory
} from '../../lib/scan.js'
import { logger } from '../../lib/logger.js'

describe('testing add/remove/init functions  ', function () {
  const historyFile = './watcher.test.history'
  const path = './test/testFiles/TestScannedDirectory'

  let logStub

  beforeEach(function () {
    fs.writeFileSync(historyFile, '')
    logStub = sinon.stub(logger, 'info')
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
    logStub.restore()
  })

  it('should correctly create an empty history file', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 15000,
      oneShot: true,
      historyWriteInterval: 10
    }

    initHistory(options)

    expect(fs.existsSync(historyFile)).to.be.true
    expect(fs.readFileSync(historyFile, 'utf8')).to.equal('')
  })

  it('should correctly add to history file', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    }

    initHistory(options)

    const file = './test/testFiles/TestScannedDirectory/file1.ckl'

    addToHistory(file)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    const data = fs.readFileSync(historyFile, 'utf8').trim() // Trim the newline character
    expect(data).to.equal(file)
  })

  it('should correctly remove from history file', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    }

    initHistory(options)

    const file = './test/testFiles/TestScannedDirectory/file1.ckl'

    addToHistory(file)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    removeFromHistory(file)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    const data = fs.readFileSync(historyFile, 'utf8').trim()

    expect(data).to.equal('')
  })
})

describe('testing starting with empty history file and adding entries', function () {
  const historyFile = './watcher.test.history'
  const path = './test/testFiles/TestScannedDirectory'

  let logStub, warnStub

  beforeEach(function () {
    fs.writeFileSync(historyFile, '')
    logStub = sinon.stub(logger, 'info')
    warnStub = sinon.stub(logger, 'warn')
    setHistory(new Set())
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
    logStub.restore()
    warnStub.restore()
  })

  it('should correctly identify the 5 new files and update the history file with all 5', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    }

    // create history file
    initHistory(options)

    // start scanning
    await startScanner(options)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(5)

    const expectedHistoryEntries = [
      './test/testFiles/TestScannedDirectory/file1.ckl',
      './test/testFiles/TestScannedDirectory/file2.ckl',
      './test/testFiles/TestScannedDirectory/file3.ckl',
      './test/testFiles/TestScannedDirectory/file4.ckl',
      './test/testFiles/TestScannedDirectory/file5.ckl'
    ]

    for (const entry of expectedHistoryEntries) {
      expect(lines).to.include(entry)
    }
  })
})

describe('testing starting with entries in history file that are also in the scanned directory', function () {
  const historyFile = './watcher.test.history'
  const path = './test/testFiles/TestScannedDirectory'

  let logStub, warnStub

  beforeEach(function () {
    fs.writeFileSync(
      historyFile,
      './test/testFiles/TestScannedDirectory/file1.ckl\n./test/testFiles/TestScannedDirectory/file2.ckl\n'
    )
    logStub = sinon.stub(logger, 'info')
    warnStub = sinon.stub(logger, 'warn')
    setHistory(new Set())
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
    logStub.restore()
    warnStub.restore()
  })

  it('should correctly return the two files previously in the history file aswell as the other three in the scanned directory.', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    }

    // create history file
    initHistory(options)

    // start scanning
    await startScanner(options)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(5)

    const expectedHistoryEntries = [
      './test/testFiles/TestScannedDirectory/file1.ckl',
      './test/testFiles/TestScannedDirectory/file2.ckl',
      './test/testFiles/TestScannedDirectory/file3.ckl',
      './test/testFiles/TestScannedDirectory/file4.ckl',
      './test/testFiles/TestScannedDirectory/file5.ckl'
    ]

    for (const entry of expectedHistoryEntries) {
      expect(lines).to.include(entry)
    }
  })
})

describe('testing starting with entries in history file that are NOT in the scanned directory', function () {
  const historyFile = './watcher.test.history'
  const path = './test/testFiles/TestScannedDirectory'

  let logStub, warnStub

  beforeEach(function () {
    fs.writeFileSync(
      historyFile,
      './test/testFiles/TestScannedDirectory/file55.ckl\n./test/testFiles/TestScannedDirectory/file22.ckl\n'
    )
    logStub = sinon.stub(logger, 'info')
    warnStub = sinon.stub(logger, 'warn')
    setHistory(new Set())
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
    logStub.restore()
    warnStub.restore()
  })

  it('should correctly remove the 2 files history file then write the 5 in the scanned directory.', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    }

    // create history file
    initHistory(options)

    // start scanning
    await startScanner(options)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(5)

    const expectedHistoryEntries = [
      './test/testFiles/TestScannedDirectory/file1.ckl',
      './test/testFiles/TestScannedDirectory/file2.ckl',
      './test/testFiles/TestScannedDirectory/file3.ckl',
      './test/testFiles/TestScannedDirectory/file4.ckl',
      './test/testFiles/TestScannedDirectory/file5.ckl'
    ]

    for (const entry of expectedHistoryEntries) {
      expect(lines).to.include(entry)
    }
  })
})

describe('testing starting with entries in history file that are not in the scanned directory and files that are in the scanned directory', function () {
  const historyFile = './watcher.test.history'
  const path = './test/testFiles/TestScannedDirectory'

  let logStub, warnStub

  beforeEach(function () {
    fs.writeFileSync(
      historyFile,
      './test/testFiles/TestScannedDirectory/file55.ckl\n./test/testFiles/TestScannedDirectory/file22.ckl\n\n./test/testFiles/TestScannedDirectory/file1.ckl\n./test/testFiles/TestScannedDirectory/file2.ckl\n'
    )
    logStub = sinon.stub(logger, 'info')
    warnStub = sinon.stub(logger, 'warn')
    setHistory(new Set())
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
    logStub.restore()
    warnStub.restore()
  })

  it('should correctly remove the 2 files history file skip 2 files already in the history file and scanned directory and add one file to the history file', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 50
    }

    // create history file
    initHistory(options)

    // start scanning
    await startScanner(options)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(5)

    const expectedHistoryEntries = [
      './test/testFiles/TestScannedDirectory/file1.ckl',
      './test/testFiles/TestScannedDirectory/file2.ckl',
      './test/testFiles/TestScannedDirectory/file3.ckl',
      './test/testFiles/TestScannedDirectory/file4.ckl',
      './test/testFiles/TestScannedDirectory/file5.ckl'
    ]

    for (const entry of expectedHistoryEntries) {
      expect(lines).to.include(entry)
    }
  })
})

describe('testing starting with empty history file and slowly adding and removing items to history manually', function () {
  this.timeout(5000)
  const historyFile = './watcher.test.history'
  const path = './test/testFiles/TestScannedDirectory'

  let logStub, warnStub

  beforeEach(function () {
    fs.writeFileSync(historyFile, '')
    logStub = sinon.stub(logger, 'info')
    warnStub = sinon.stub(logger, 'warn')
    setHistory(new Set())
  })

  afterEach(function () {
    fs.unlinkSync(historyFile)
    logStub.restore()
    warnStub.restore()
  })

  it('should correctly remove the 2 files history file skip 2 files already in the history file and scanned directory and add one file to the history file', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 50
    }

    // create history file
    initHistory(options)

    addToHistory('./test/testFiles/TestScannedDirectory/file1.ckl')
    addToHistory('./test/testFiles/TestScannedDirectory/file2.ckl')

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // read the history file
    const data = fs.readFileSync(historyFile, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')

    expect(lines.length).to.equal(2)
    expect(lines).to.include('./test/testFiles/TestScannedDirectory/file1.ckl')
    expect(lines).to.include('./test/testFiles/TestScannedDirectory/file2.ckl')

    removeFromHistory('./test/testFiles/TestScannedDirectory/file1.ckl')

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // read the history file
    const data2 = fs.readFileSync(historyFile, 'utf8')
    const lines2 = data2.split('\n').filter(line => line.trim() !== '')

    expect(lines2.length).to.equal(1)
    expect(lines2).to.include('./test/testFiles/TestScannedDirectory/file2.ckl')
  })
})

describe('testing no history file mode', function () {
  const historyFile = null
  const path = './test/testFiles/TestScannedDirectory'

  let logStub, warnStub

  beforeEach(function () {
    logStub = sinon.stub(logger, 'info')
    warnStub = sinon.stub(logger, 'warn')
    setHistory(new Set())
  })

  afterEach(function () {
    logStub.restore()
    warnStub.restore()
  })

  it('should correctly run in no history file mode', async function () {
    const options = {
      historyFile: historyFile,
      path: path,
      scanInterval: 5000,
      oneShot: true,
      historyWriteInterval: 10
    }

    initHistory(options)

    const file = './test/testFiles/TestScannedDirectory/file1.ckl'

    addToHistory(file)

    await new Promise(resolve =>
      setTimeout(resolve, options.historyWriteInterval)
    )

    // expect no history file to be created
    expect(fs.existsSync(historyFile)).to.be.false
  })
})

describe('cleaning up', function () {
  after(async function () {
    setTimeout(() => {
      process.exit(0); // Delayed exit to allow Mocha to output results
    }, 1000); // Adjust time as necessary for your environment
  });
  
  it('should clean up the history file', function () {
    const historyFilePath = './watcher.test.history'
    // Check if the file exists and delete it
    if (fs.existsSync(historyFilePath)) {
      fs.unlinkSync(historyFilePath)
    }
  })
})
