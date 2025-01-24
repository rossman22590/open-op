'use client';

import { useState, useEffect } from 'react';

export default function EnvCheck() {
  const [envVars, setEnvVars] = useState<Record<string, string> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEnvVars() {
      try {
        const response = await fetch('/api/env');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setEnvVars(data);
      } catch (e) {
        setError('Failed to fetch environment variables');
        console.error('Error:', e);
      } finally {
        setIsLoading(false);
      }
    }

    fetchEnvVars();
  }, []);

  if (isLoading) return <p>Loading environment variables...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <h1>Local .env Variables</h1>
      <pre>{JSON.stringify(envVars, null, 2)}</pre>
    </div>
  );
}
