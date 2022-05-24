function getSpreadsheets() {
  let items = []
  let pageToken
  do {
    const spreadsheets = Drive.Files.list({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet'",
      maxResults: 100,
      pageToken,
    })
    items = [...items, ...spreadsheets.items.map(({ title, id }) => ({ title, id }))]
    pageToken = spreadsheets.nextPageToken
  } while (pageToken)
  return items
}

function getParticipants(sheet) {
  return sheet.getRange("A2:A20").getValues().map(e => e[0]).filter(e => e !== '')
}

function calculateRoundRobinList(n) {
  if (n <= 1) return [[]]
  let ring = [...Array(n - 1).keys()].map(e => e + 1)
  const list = []
  for (let i = 0; i < n - 1; i++) {
    const matches = []
    matches.push([0, ring[0]])
    let ix = 1
    for (let diff = n - 3; diff > 0; diff -= 2) {
      const x = ring[ix]
      const y = ring[ix + diff]
      matches.push([x, y])
      ix++
    }
    list.push(matches)
    ring = [...ring.slice(1), ring[0]]
  }
  return list
}

function initializeSheet(sheet, participants) {
  sheet.getRange('A1:Z20').clear()

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i]
    sheet.getRange(i + 2, 1).setValue(participant)
    sheet.getRange(1, i + 2).setValue(participant)
  }
}

function getSides(sheet, matches) {
  return matches.map(([x, y]) => [
    Number(sheet.getRange(x + 2, y + 2).getValues()[0][0]),
    Number(sheet.getRange(y + 2, x + 2).getValues()[0][0])
  ])
}

function setSides(sheet, matches, sides) {
  for (let i = 0; i < matches.length; i++) {
    const [x, y] = matches[i]
    if (sides[0][i] === '-1' || sides[1][i] === '-1') continue
    sheet.getRange(x + 2, y + 2).setValue(Number(sides[0][i]))
    sheet.getRange(y + 2, x + 2).setValue(Number(sides[1][i]))
  }
}

function getPlaces(sheet, participants) {
  return participants.map((participant, i) => {
    const sides = sheet.getRange(i + 2, 2, 1, participants.length).getValues()[0].map(Number)
    return [
      sides.filter(e => e === 6).length,
      sides.reduce((xs, x) => xs + x, 0),
      participant,
    ]
  }).sort(([xWins, xSideTaken], [yWins, ySideTaken]) =>
    xWins !== yWins ? yWins - xWins : ySideTaken - xSideTaken
  )
}

function getTakenSideTable(sheet, numOfParticipants) {
  return sheet.getRange(2, 2, numOfParticipants, numOfParticipants).getValues().map(row => row.map(Number))
}

function doGet(e) {
  const spreadsheetId = Array.isArray(e.parameters.spreadsheetId) && e.parameters.spreadsheetId[0]
  if (!spreadsheetId) {
    const spreadsheets = getSpreadsheets()
    const template = HtmlService.createTemplateFromFile('index')
    template.spreadsheets = spreadsheets
    const output = template.evaluate()
    output.setTitle('スプレッドシートの選択 - ポケモンカード総当たり')
    output.setFaviconUrl('https://ptc-round-robin.kaito.tokyo/icon.png')
    return output
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId)
  const sheet = spreadsheet.getActiveSheet()

  const init = Array.isArray(e.parameters.init) && e.parameters.init[0]
  if (init === 'init') {
    const { participants } = e.parameters
    initializeSheet(sheet, participants)
    const template = HtmlService.createTemplateFromFile('init')
    template.spreadsheetId = spreadsheetId
    const output = template.evaluate()
    output.setTitle('スプレッドシート初期化完了 - ポケモンカード総当たり')
    output.setFaviconUrl('https://ptc-round-robin.kaito.tokyo/icon.png')
    return output
  }

  const round = e.parameters.round ? Number(e.parameters.round[0]) : 1
  const participants = getParticipants(sheet)
  const n = Math.ceil(participants.length / 2) * 2
  const roundRobinList = calculateRoundRobinList(n)
  const matches = roundRobinList[round - 1] ?? []

  const saveRound = e.parameters.saveRound && Number(e.parameters.saveRound[0])
  if (saveRound) {
    const { x, y } = e.parameters
    setSides(sheet, roundRobinList[saveRound - 1], [x, y])
  }

  const takenSideTable = getTakenSideTable(sheet, participants.length)
  const sides = getSides(sheet, matches)

  const showPlaces = e.parameters.showPlaces && !!e.parameters.showPlaces[0]

  if (showPlaces) {
    const template = HtmlService.createTemplateFromFile('places')
    template.places = getPlaces(sheet, participants)
    template.spreadsheetId = spreadsheetId
    template.maxRound = roundRobinList.length
    const output = template.evaluate()
    output.setTitle('結果発表 - ポケモンカード総当たり')
    output.setFaviconUrl('https://ptc-round-robin.kaito.tokyo/icon.png')
    return output
  }

  const template = HtmlService.createTemplateFromFile('app')
  template.roundRobinList = roundRobinList
  template.takenSideTable = takenSideTable
  template.matches = matches
  template.maxRound = roundRobinList.length
  template.participants = participants
  template.round = round
  template.spreadsheetId = spreadsheetId
  template.sides = sides
  const output = template.evaluate()
  output.setTitle('マッチメイカー - ポケモンカード総当たり')
  output.setFaviconUrl('https://ptc-round-robin.kaito.tokyo/icon.png')
  return output
}
