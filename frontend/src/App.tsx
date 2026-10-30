import { Navigate, Route, Routes } from 'react-router'
import Layout from './components/Layout.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import RecordsPage from './pages/RecordsPage.tsx'
import SolvePage from './pages/SolvePage.tsx'

// 화면 목록·이동 규칙: SCREEN-SPEC 2절, 5절
function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/solve" replace />} />
        <Route path="solve" element={<SolvePage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
