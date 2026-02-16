import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProcessingProvider } from "./context/ProcessingContext";
import FileManager from "./pages/FileManager";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <BrowserRouter>
      <ProcessingProvider>
        <Routes>
          <Route path="/" element={<FileManager />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/:fileId" element={<Dashboard />} />
        </Routes>
      </ProcessingProvider>
    </BrowserRouter>
  );
}

export default App;
