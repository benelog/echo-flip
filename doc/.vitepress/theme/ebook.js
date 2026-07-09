// 북마크·형광펜의 저장(localStorage)과 위치 직렬화.
// 형광펜은 DOM 경로 대신 "본문에서 몇 번째로 등장하는 문구"로 저장해
// 창 크기나 렌더링이 달라져도 같은 자리를 다시 찾을 수 있게 한다.

export function loadList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function saveList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {}
}

// 본문 텍스트 노드를 문서 순서로 이어 붙인 전체 문자열과 노드별 시작 오프셋
function collectText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  let text = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n, start: text.length })
    text += n.data
  }
  return { text, nodes }
}

// 선택 영역 → { text, occ } (본문에서 occ번째로 등장하는 text)
export function serializeRange(root, range) {
  const text = range.toString()
  if (!text.trim()) return null
  // root 시작부터 선택 시작점까지의 텍스트 길이 = 전역 오프셋
  const pre = range.cloneRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  const { text: full } = collectText(root)
  let occ = 0
  for (let i = full.indexOf(text); i !== -1 && i < start; i = full.indexOf(text, i + 1)) {
    occ++
  }
  return { text, occ }
}

// { text, occ } → Range (본문이 바뀌어 못 찾으면 null)
export function findRange(root, rec) {
  const { text: full, nodes } = collectText(root)
  let at = -1
  for (let k = 0; k <= rec.occ; k++) {
    at = full.indexOf(rec.text, at + 1)
    if (at === -1) return null
  }
  const start = locate(nodes, at, false)
  const end = locate(nodes, at + rec.text.length, true)
  if (!start || !end) return null
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

function locate(nodes, offset, isEnd) {
  for (const { node, start } of nodes) {
    const end = start + node.data.length
    if (offset < end || (isEnd && offset <= end)) {
      return { node, offset: offset - start }
    }
  }
  return null
}

// 북마크의 기준점이 되는 블록 요소들 (문서 순서)
export function blockAnchors(root) {
  return Array.from(root.querySelectorAll('h1, h2, h3, h4, p, li, pre, table, blockquote'))
}
