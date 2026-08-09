'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
    const [supabase, setSupabase] = useState<any>(null);
    const [mode, setMode] = useState<'signin' | 'signup'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [initError, setInitError] = useState('');

    useEffect(() => {
        import('@/lib/supabase-browser').then(({ createClient }) => {
            setSupabase(createClient());
        }).catch((err) => {
            setInitError('Supabase not configured. Check your .env.local file.');
            console.error(err);
        });
    }, []);

    async function handleEmailAuth(e: React.FormEvent) {
        e.preventDefault();
        if (!supabase) { setError('Auth service not ready. Please wait...'); return; }
        setError('');
        setLoading(true);

        try {
            if (mode === 'signup') {
                const { data, error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: name || email.split('@')[0] },
                        // If you disable email confirmation in Supabase, set this:
                        // emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                });
                if (signUpError) throw signUpError;

                if (data?.user?.identities?.length === 0) {
                    setError('This email is already registered. Try signing in instead.');
                    setMode('signin');
                } else if (data?.session) {
                    // Email confirmation is disabled — user is logged in immediately
                    router.push('/');
                    router.refresh();
                } else {
                    // Email confirmation is required
                    setError('Account created! Check your email for the confirmation link, then sign in.');
                    setMode('signin');
                }
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (signInError) throw signInError;
                router.push('/');
                router.refresh();
            }
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', background: 'var(--bg-primary)', padding: 'var(--space-md)'
        }}>
            <div style={{
                width: '100%', maxWidth: '400px',
                background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-2xl)', border: '1px solid var(--bg-tertiary)'
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
                    <div style={{
                        width: '48px', height: '48px', borderRadius: '12px',
                        background: 'var(--accent)', display: 'inline-flex',
                        alignItems: 'center', justifyContent: 'center', marginBottom: 'var(--space-md)'
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: 'var(--font-xl)', fontWeight: 700 }}>Bubble</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)', marginTop: '4px' }}>
                        Your music, your way
                    </p>
                </div>

                {/* Error / Info */}
                {initError && (
                    <div style={{
                        padding: 'var(--space-sm) var(--space-md)', marginBottom: 'var(--space-md)',
                        borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-sm)',
                        background: 'rgba(231,76,60,0.15)', color: 'var(--danger)',
                        border: '1px solid var(--danger)'
                    }}>
                        {initError}
                    </div>
                )}
                {error && (
                    <div style={{
                        padding: 'var(--space-sm) var(--space-md)', marginBottom: 'var(--space-md)',
                        borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-sm)',
                        background: error.includes('Check your email') ? '#0d3b1e' : 'rgba(231,76,60,0.15)',
                        color: error.includes('Check your email') ? 'var(--accent)' : 'var(--danger)',
                        border: `1px solid ${error.includes('Check your email') ? 'var(--accent)' : 'var(--danger)'}`
                    }}>
                        {error}
                    </div>
                )}

                {/* Email Form */}
                <form onSubmit={handleEmailAuth}>
                    {mode === 'signup' && (
                        <input
                            type="text"
                            placeholder="Full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={!supabase}
                            style={inputStyle}
                        />
                    )}
                    <input
                        type="email"
                        placeholder="Email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={!supabase}
                        style={inputStyle}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        disabled={!supabase}
                        style={inputStyle}
                    />
                    <button
                        type="submit"
                        disabled={loading || !supabase}
                        style={{
                            width: '100%', padding: '12px', borderRadius: 'var(--radius-md)',
                            background: 'var(--accent)', color: '#000', fontWeight: 600,
                            fontSize: 'var(--font-md)', marginTop: 'var(--space-sm)',
                            opacity: loading ? 0.6 : 1, border: 'none'
                        }}
                    >
                        {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                    </button>
                </form>

                {/* Toggle mode */}
                <div style={{
                    textAlign: 'center', marginTop: 'var(--space-md)',
                    fontSize: 'var(--font-sm)', color: 'var(--text-secondary)'
                }}>
                    {mode === 'signin' ? (
                        <>Don&apos;t have an account?{' '}
                            <button onClick={() => { setMode('signup'); setError(''); }}
                                style={{ color: 'var(--accent)', fontWeight: 500, background: 'none', border: 'none' }}>
                                Sign up
                            </button>
                        </>
                    ) : (
                        <>Already have an account?{' '}
                            <button onClick={() => { setMode('signin'); setError(''); }}
                                style={{ color: 'var(--accent)', fontWeight: 500, background: 'none', border: 'none' }}>
                                Sign in
                            </button>
                        </>
                    )}
                </div>

                <div style={{
                    textAlign: 'center', marginTop: 'var(--space-lg)'
                }}>
                    <Link href="/" style={{
                        fontSize: 'var(--font-sm)', color: 'var(--text-tertiary)',
                        textDecoration: 'none'
                    }}>
                        ← Back to Bubble
                    </Link>
                </div>
            </div>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: 'var(--font-md)',
    marginBottom: 'var(--space-sm)',
    outline: 'none',
};
