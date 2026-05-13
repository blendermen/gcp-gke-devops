import React, { useState, useEffect } from 'react';

/**
 * Główny komponent aplikacji frontendowej w React.
 * Dostosowany do Tailwind CSS v4.0.
 */
export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [visits, setVisits] = useState(0);

  // Lokalnie uderzamy w port backendu (localhost:5000).
  // W Azure/Kubernetes używamy ścieżki relatywnej '/api/data'.
  const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:5000/api/data' 
    : '/api/data';

     // Efekt uruchamiany przy wejściu na stronę
  useEffect(() => {
    fetchVisits();
  }, []);

  const fetchVisits = async () => {
    try {
      const response = await fetch(`${API_URL}/visit`, { method: 'POST' });
      const result = await response.json();
      if (result.visits) setVisits(result.visits);
    } catch (err) {
      console.error("Błąd licznika:", err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`Błąd serwera: ${response.status}`);
      }
      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
      } else {
        setData(result);
      }
    } catch (err) {
      setError("Nie udało się połączyć z API. Upewnij się, że backend działa.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
        <header className="mb-8">
          <div className="inline-block p-3 bg-blue-50 rounded-full mb-4">
            <span className="text-4xl">🚀</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            GCP GKE React V2 
          </h1>
          <p className="text-slate-500 mt-2">
            Demo wdrożenia aplikacji webowej na Google Cloud Platform - GKE (React + Flash + PostgreSQL)
          </p>
        </header>

        <main>
          <div className="bg-slate-50 rounded-xl p-6 mb-8 text-left min-h-[120px] flex flex-col justify-center border border-slate-100 relative overflow-hidden">
            {loading && (
              <div className="flex items-center justify-center space-x-2 text-blue-600 animate-pulse">
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                <span className="ml-2 font-medium">Pobieranie danych...</span>
              </div>
            )}

            {error && (
              <div className="text-red-500 bg-red-50 p-3 rounded-lg border border-red-100">
                <p className="font-bold flex items-center">
                  <span className="mr-2">⚠️</span> Błąd
                </p>
                <p className="text-sm mt-1 opacity-90">{error}</p>
              </div>
            )}

            {!loading && !error && data && (
              <div className="animate-in fade-in duration-500">
                <div className="flex items-center text-green-600 font-semibold mb-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                  Połączono z bazą
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Wersja PostgreSQL</span>
                    <code className="block text-xs bg-white p-2 rounded border border-slate-200 mt-1 text-slate-600 font-mono">
                      {data.database_version}
                    </code>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Źródło:</span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md font-medium text-xs">
                      {data.source}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!loading && !error && !data && (
              <p className="text-slate-400 italic text-center text-sm">
                Kliknij przycisk, aby odpytać backend
              </p>
            )}
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="w-full py-4 px-6 rounded-xl font-bold text-white transition-all cursor-pointer shadow-lg shadow-blue-200 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed"
          >
            {loading ? 'Przetwarzanie...' : 'Pobierz dane z bazy'}
          </button>
        </main>

        <footer className="mt-8 pt-6 border-t border-slate-100 text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
          Marcin Mazur 2026
         
          {/* Licznik odwiedzin */}
          <div className='mt-3 text-blue-500'>licznik odwiedźin</div>
          <div className="text-1x1 font-black">{visits}</div>
       
        </footer>
      </div>
    </div>
  );
}