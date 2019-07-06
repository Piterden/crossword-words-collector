const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')

class SimpleFileStorageKey {
  constructor(path) {
    this.path = path
    this.jsonSpace = '  '
  }

  get(def) {
    try {
      return JSON.parse(fs.readFileSync(this.path, 'utf8'))
    } catch (e) {
      return def
    }
  }

  set(value) {
    fs.writeFileSync(
      this.path,
      JSON.stringify(value, '', this.jsonSpace),
      'utf8'
    )
  }

  update(callback, def) {
    this.set(callback(this.get(def)))
  }
}

class SimpleFileStorage {
  constructor(section, options) {
    this.options = {
      dir: './',
      ...options,
    }
    this.pathStart = path.join(__dirname, this.options.dir, `_${section}_`)
  }

  key(key) {
    return new SimpleFileStorageKey(`${this.pathStart}${key}.json`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class WaitFor {
  constructor() {
    this.resolve
    this.promise
    this._reset()
  }

  _reset() {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  set() {
    this.resolve()
  }

  async wait() {
    await this.promise
    this._reset()
  }
}

class QueueItem {
  constructor(name, args) {
    this.name = name
    this.args = args
    this.errors = []
    this.process = false
  }

  static fromRaw(raw) {
    return new this(raw.name, raw.args)
  }
}

class QueueLoad {
  constructor(options) {
    this.options = {
      sfsk: new SimpleFileStorage('QueueLoad').key('Queue'),
      maxThreads: 1,
      ...options,
    }

    this.names = {}
    this.queue = []
    this.errors = []
    this.numThreads = 0
    this.work = false
    this.maxThreads = this.options.maxThreads
    this.sfsk = this.options.sfsk
    this.next = 0
    this.waitFor = new WaitFor()
    this.loadQueue()
  }

  _queueDelAndMoveToBack(queueItem, moveBack = false) {
    const i = this.queue.findIndex((v) => v === queueItem)
    this.queue.splice(i, 1)
    if (moveBack) this.queue.push(queueItem)
  }

  _nextPush() {
    this.next++
  }

  _nextPop() {
    if (this.next) {
      this.next--
      return true
    }
  }

  isContinue() {
    return this.sfsk.get(undefined) !== undefined
  }

  reg(key, callback) {
    this.names[key] = callback
  }

  push(name, ...args) {
    this.queue.push(new QueueItem(name, args))
  }

  async doQueueItem(queueItem) {
    const fun = this.names[queueItem.name]
    if (!fun) this.pushError(new Error(`Name '${queueItem.name}' not found`))

    try {
      await fun(this, ...queueItem.args)
      return true
    } catch (e) {
      this.pushError(e)
      queueItem.errors.push(e.message)
    }

    return false
  }

  async start() {
    this.work = true

    while (this.work) {
      if (!(await this.doQueueItems(0, this.waitFor))) {
        break
      }

      await this.waitFor.wait()
    }

    while (this.work) {
      if (!(await this.doQueueItems(5, this.waitFor))) {
        break
      }

      await this.waitFor.wait()
    }
  }

  async stop() {
    this.work = false
  }

  async doQueueItems(numErrors = 0, waitFor) {
    const queueItemArray = []

    for (const queueItem of this.queue) {
      if (this.numThreads >= this.maxThreads) {
        break
      }

      if (queueItem.process || queueItem.errors.length >= numErrors) {
        continue
      }

      this.numThreads += 1
      queueItem.process = true
      queueItemArray.push(queueItem)
    }

    for (const queueItem of queueItemArray) {
      ;(async () => {
        const result = await this.doQueueItem(queueItem)
        this._queueDelAndMoveToBack(queueItem, !result)

        queueItem.process = false
        this.numThreads--
        this.saveQueue()

        waitFor.set()
      })()
    }

    return queueItemArray.length
  }

  loadQueue() {
    this.queue = []
    const queue = this.sfsk.get([])
    for (const raw of queue) {
      this.queue.push(QueueItem.fromRaw(raw))
    }
  }

  saveQueue() {
    this.sfsk.set(this.queue)
  }

  pushError(error) {
    console.log('Error: %s', error.message)
    this.errors.push(error)
  }
}

const queueLoad = new QueueLoad({
  sfsk: new SimpleFileStorage('Tmp').key('queue'),
  maxThreads: 10,
})

let DEV_FAST_TEST = 1

queueLoad.reg('init', async (queueLoad) => {
  for (let i = 0; i <= 308; i++) {
    const answers = []
    const url = `https://www.freecrosswordsolver.com/sitemap-answers-${i}.xml`

    queueLoad.push('answerLoad', url)
    if (DEV_FAST_TEST) return
  }
})

queueLoad.reg('answerLoad', async (queueLoad, url) => {
  console.log('answerLoad: %s', url)
  const words =
    (await (await fetch(url)).text()).match(/(?<=answer\/)\w+(?=<)/g) || []
  if (DEV_FAST_TEST) words.splice(100)

  for (const word of words) queueLoad.push('collectClues', word)
})

queueLoad.reg('collectClues', async (queueLoad, word) => {
  const clues = []
  const url = `https://www.freecrosswordsolver.com/answer/${word}`

  console.log('collectClues: %s', url)
  const text = await (await fetch(url)).text()
  const re = new RegExp(
    `(?<=<a class="page-link" href="https:\/\/www\\.freecrosswordsolver\\.com\/answer\/${word}\\?page=)\\d+(?=">)`,
    'g'
  )
  const pages = text.match(re)

  if (pages) {
    for (const page of pages) queueLoad.push('collectCluesOther', word, page)
  }
})

queueLoad.reg('collectCluesOther', async (queueLoad, word, page) => {
  const url = `https://www.freecrosswordsolver.com/answer/${word}?page=${page}`

  console.log('collectCluesOther: %s', url)
  const text = await (await fetch(url)).text()
  const clues = text.match(/(?<=crossword-clue">)[\w\s]+(?=<)/g) || []

  new SimpleFileStorage('main').key('words').update((words) => {
    let wordObj = words.find((v) => v.word === word)

    if (!wordObj) {
      wordObj = { word, clues: [] }
      words.push(wordObj)
    }

    wordObj.clues.push(...clues)
    let set = new Set()

    wordObj.clues = wordObj.clues.filter((s) =>
      set.has(s) ? false : (set.add(s), true)
    )

    return words
  }, [])
})

if (!queueLoad.isContinue()) {
  console.log('Init')
  queueLoad.push('init')
}

queueLoad.start()
