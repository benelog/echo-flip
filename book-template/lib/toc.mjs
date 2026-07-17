// book.config의 toc 하나에서 사이드바·PDF 차례·첫 장 경로를 모두 파생한다.
// 장을 더하거나 빼면 book.config.mjs의 toc만 고치면 된다.

const stripExt = (file) => file.replace(/\.(adoc|md)$/, '')

// PDF 차례·아웃라인용 평탄화 목록: { file, route, title, part }
// part는 그 항목 앞에 부 제목 줄을 넣을 때만 존재한다.
// 기본값은 "그룹의 첫 항목이면 그룹 이름"이고, 항목의 pdfPart로 바꿀 수 있다.
export function flattenChapters(book) {
  const out = []
  for (const group of book.toc) {
    group.items.forEach((item, i) => {
      out.push({
        file: item.file,
        route: stripExt(item.file),
        title: item.pdfTitle ?? item.text,
        part: item.pdfPart ?? (i === 0 ? group.text : undefined),
      })
    })
  }
  return out
}

export function firstRoute(book) {
  return flattenChapters(book)[0].route
}

// VitePress 사이드바
export function sidebar(book) {
  return book.toc.map((group) => ({
    text: group.text,
    items: group.items.map((item) => ({ text: item.text, link: '/' + stripExt(item.file) })),
  }))
}
