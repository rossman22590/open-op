// components/PasswordProtection.tsx
"use client";

import { useState, useEffect } from "react";

export default function PasswordProtection({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const storedAuth = localStorage.getItem("isAuthenticated");
    if (storedAuth === "true") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === process.env.NEXT_PUBLIC_PASSWORD) {
      setIsAuthenticated(true);
      localStorage.setItem("isAuthenticated", "true");
    } else {
      setError("Incorrect password. Please try again.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-gradient-to-tl from-black via-black to-pink-900 text-pink-200 flex items-center justify-center min-h-screen">
        <div className="bg-[#1a1a1a]/80 p-8 rounded-lg shadow-xl border border-pink-600/30 max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4 text-center">AI Tutor Browser</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block mb-2">Enter Password:</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-black/40 border border-pink-600/40 rounded-md text-pink-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
            </div>
            {error && <p className="text-red-400">{error}</p>}
            <button
              type="submit"
              className="w-full bg-pink-600 text-white py-2 rounded-md hover:bg-pink-700 transition-colors"
            >
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
