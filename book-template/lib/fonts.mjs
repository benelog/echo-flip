// 사이트 head와 PDF 표지·차례가 같은 웹폰트를 쓴다.
// 한글 폰트가 없는 CI 러너에서도 본문이 명조·고딕으로 렌더링되게 하는 폴백이다.
export const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;600;700&display=swap'

export const FONT_LINKS = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${FONT_URL}">`
