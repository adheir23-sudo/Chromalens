import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Header from "@/components/Header";
import AnalyzerPage from "@/pages/AnalyzerPage";
import GalleryPage from "@/pages/GalleryPage";
import AnalysisDetailPage from "@/pages/AnalysisDetailPage";
import AboutPage from "@/pages/AboutPage";
import EditorPage from "@/pages/EditorPage";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<AnalyzerPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/analysis/:id" element={<AnalysisDetailPage />} />
          <Route path="/edit" element={<EditorPage />} />
          <Route path="/edit/from/:id" element={<EditorPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#12151E",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#F3F4F6",
              fontFamily: "Inter, sans-serif",
            },
          }}
        />
      </BrowserRouter>
    </div>
  );
}

export default App;
