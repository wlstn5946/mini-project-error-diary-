// S-004 찾을 수 없음. 사이드바는 Layout에서 그대로 보이고, 강조 메뉴는 없다.
function NotFoundPage() {
  return (
    <>
      <h1 className="page-title">찾을 수 없음</h1>
      <p>요청한 화면을 찾을 수 없어요. 왼쪽 메뉴에서 이동해 주세요.</p>
    </>
  )
}

export default NotFoundPage
