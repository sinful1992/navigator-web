// src/Auth.tsx
import * as React from "react";

type Props = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onForceSignOut: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
};

export function Auth({ onSignIn, onSignUp, onResetPassword, onForceSignOut, isLoading, error, onClearError }: Props) {
  const [mode, setMode] = React.useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [resetSent, setResetSent] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!email) {
      return;
    }

    if (mode === "reset") {
      try {
        await onResetPassword(email);
        setResetSent(true);
      } catch (err) {
        // Error handled by parent component
      }
      return;
    }

    if (!password) {
      return;
    }

    if (password.length < 6) {
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      return;
    }

    try {
      if (mode === "signin") {
        await onSignIn(email, password);
      } else {
        await onSignUp(email, password);
      }
    } catch (err) {
      // Error handled by parent component
    }
  };

  React.useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        onClearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, onClearError]);

  return (
    <div className="container">
      <div style={{
        maxWidth: "400px",
        margin: "2rem auto",
        padding: "2rem",
        background: "var(--surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-light)",
        boxShadow: "var(--shadow-lg)"
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ 
            margin: "0 0 0.5rem 0", 
            fontSize: "1.75rem",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}>
            📍 Address Navigator
          </h1>
          <p style={{
            margin: 0,
            color: "var(--text-secondary)",
            fontSize: "0.875rem"
          }}>
            {mode === "signin" ? "Sign in to sync across devices" : mode === "signup" ? "Create account to get started" : "Reset your password"}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: "0.75rem",
            marginBottom: "1rem",
            background: "var(--danger-light)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            color: "var(--danger)",
            fontSize: "0.875rem"
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Success Message for Password Reset */}
        {mode === "reset" && resetSent && (
          <div style={{
            padding: "0.75rem",
            marginBottom: "1rem",
            background: "var(--success-light)",
            border: "1px solid var(--success)",
            borderRadius: "var(--radius)",
            color: "var(--success)",
            fontSize: "0.875rem"
          }}>
            ✅ Password reset email sent! Check your inbox.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "var(--text-secondary)"
                }}
              >
                📧 Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="your@email.com"
                disabled={isLoading}
                required
                autoComplete="email"
              />
            </div>

            {mode !== "reset" && (
              <div>
                <label
                  htmlFor="password"
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)"
                  }}
                >
                  🔒 Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="Password (6+ characters)"
                  disabled={isLoading}
                  minLength={6}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  style={{
                    display: "block",
                    marginBottom: "0.5rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)"
                  }}
                >
                  🔒 Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  placeholder="Confirm password"
                  disabled={isLoading}
                  minLength={6}
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <button
              type="submit"
              className={`btn btn-primary ${isLoading ? 'pulse' : ''}`}
              disabled={isLoading}
              style={{ marginTop: "0.5rem" }}
            >
              {isLoading ? (
                <>
                  <div className="spinner" />
                  {mode === "signin" ? "Signing in..." : mode === "signup" ? "Creating account..." : "Sending reset email..."}
                </>
              ) : (
                <>
                  {mode === "signin" ? "🚀 Sign In" : mode === "signup" ? "✨ Create Account" : "📧 Send Reset Link"}
                </>
              )}
            </button>
          </div>
        </form>

        {/* Toggle Mode */}
        <div style={{
          textAlign: "center",
          marginTop: "1.5rem",
          fontSize: "0.875rem",
          color: "var(--text-secondary)"
        }}>
          {mode === "reset" ? (
            <>
              Remember your password?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setResetSent(false);
                  onClearError();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--primary)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "inherit"
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setConfirmPassword("");
                  setResetSent(false);
                  onClearError();
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--primary)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "inherit"
                }}
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </>
          )}
        </div>

        {/* Forgot Password Link */}
        {mode === "signin" && (
          <div style={{
            textAlign: "center",
            marginTop: "0.75rem",
            fontSize: "0.875rem"
          }}>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setResetSent(false);
                onClearError();
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: "inherit"
              }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {/* Offline Work Notice */}
        <div style={{
          marginTop: "1.5rem",
          padding: "0.75rem",
          background: "var(--bg-tertiary)",
          borderRadius: "var(--radius)",
          fontSize: "0.8125rem",
          color: "var(--text-muted)",
          textAlign: "center"
        }}>
          💡 <strong>Tip:</strong> The app works offline. Data will sync when you're back online.
        </div>
      </div>
    </div>
  );
}
