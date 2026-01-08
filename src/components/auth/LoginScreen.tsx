import React, { useState } from 'react';
import { Lock, LogIn, RefreshCw } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
  staticUsername: string;
  staticPassword: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, staticUsername, staticPassword }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    // Simulate a brief delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300));

    if (username === staticUsername && password === staticPassword) {
      localStorage.setItem('isAuthenticated', 'true');
      onLogin();
    } else {
      setLoginError('Invalid username or password');
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 md:p-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-xl mb-4 shadow-lg">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">EquipLocate</h1>
          <p className="text-slate-500">Please sign in to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-semibold text-slate-700 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-slate-800"
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-slate-800"
              placeholder="Enter your password"
              required
            />
          </div>

          {loginError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-brand-600 text-white py-3 rounded-lg font-semibold hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoggingIn ? (
              <>
                <RefreshCw className="animate-spin mr-2" size={20} />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="mr-2" size={20} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-500">
          <p>&copy; 2024 EquipLocate v2.0</p>
        </div>
      </div>
    </div>
  );
};

