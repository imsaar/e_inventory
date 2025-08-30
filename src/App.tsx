import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { Dashboard } from './pages/Dashboard';
import { Components } from './pages/Components';
import { Locations } from './pages/Locations';
import { Projects } from './pages/Projects';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Navigation />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/components" element={<Components />} />
            <Route path="/locations" element={<Locations />} />
            <Route path="/projects" element={<Projects />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;