const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')

const getUrls = async () => {
  const url = `https://www.freecrosswordsolver.com/sitemap-answers.xml`
  const response = await fetch(url)

  if (!response) {
    return []
  }
  const text = await response.text()

  return text.match(/https:\/\/www\.freecrosswordsolver\.com\/sitemap-answers-\d+\.xml/g)
    .map((url) => fetch(url))
}

const getWords = async (urls) => {
  const words = []

  for await (const response of urls) {
    console.time('i')
    // const response = await fetch(url)

    if (!response) {
      continue
    }
    const text = await response.text()
    const match = text.match(/(?<=<loc>https:\/\/www\.freecrosswordsolver\.com\/answer\/)\w+(?=<\/loc>)/g)

    if (match) {
      words.push(...match)
    }
    console.timeEnd('i')
  }

  return words
}

(async () => {
  const urls = await getUrls()

  console.log(urls.length)

  const words = await getWords(urls)

  console.log(words.length)

  const unique = [...new Set(words)]
    .filter(({ length }) => length > 2)
    .sort((a, b) => a.length - b.length || a.localeCompare(b))

  console.log(unique.length)

  fs.writeFileSync(path.resolve('words.txt'), unique.join('\n'))
})()

//   for (let i = 0; i <= 309; i++) {
//     const answers = []
//   }
// queueLoad.reg('answerLoad', async (queueLoad, url) => {
//   console.log('answerLoad: %s', url)
//   const words =
//     (await (await fetch(url)).text()).match(/(?<=answer\/)\w+(?=<)/g) || []
//   if (DEV_FAST_TEST) words.splice(100)

//   for (const word of words) {
//     all.push(word)
//     // queueLoad.push('collectClues', word)
//   }
// })

// queueLoad.reg('collectClues', async (queueLoad, word) => {
//   const clues = []
//   const url = `https://www.freecrosswordsolver.com/answer/${word}`

//   console.log('collectClues: %s', url)
//   const text = await (await fetch(url)).text()
//   const re = new RegExp(
//     `(?<=<a class="page-link" href="https:\/\/www\\.freecrosswordsolver\\.com\/answer\/${word}\\?page=)\\d+(?=">)`,
//     'g'
//   )
//   const pages = text.match(re)

//   if (pages) {
//     for (const page of pages) queueLoad.push('collectCluesOther', word, page)
//   }
// })

// queueLoad.reg('collectCluesOther', async (queueLoad, word, page) => {
//   const url = `https://www.freecrosswordsolver.com/answer/${word}?page=${page}`

//   console.log('collectCluesOther: %s', url)
//   const text = await (await fetch(url)).text()
//   const clues = text.match(/(?<=crossword-clue">)[\w\s]+(?=<)/g) || []

//   new SimpleFileStorage('main').key('words').update((words) => {
//     let wordObj = words.find((v) => v.word === word)

//     if (!wordObj) {
//       wordObj = { word, clues: [] }
//       words.push(wordObj)
//     }

//     wordObj.clues.push(...clues)
//     let set = new Set()

//     wordObj.clues = wordObj.clues.filter((s) =>
//       set.has(s) ? false : (set.add(s), true)
//     )

//     return words
//   }, [])
// })

// if (!queueLoad.isContinue()) {
//   console.log('Init')
//   queueLoad.push('init')
// }

// queueLoad.start()
