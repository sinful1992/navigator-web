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
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      padding: "1rem"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "white",
        borderRadius: "16px",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "3rem 2.5rem 2rem",
          textAlign: "center",
          background: "white"
        }}>
          <h1 style={{
            margin: "0 0 0.75rem 0",
            fontSize: "2rem",
            fontWeight: 700,
            color: "#1a202c",
            letterSpacing: "-0.025em"
          }}>
            Navigator
          </h1>
          <p style={{
            margin: 0,
            color: "#718096",
            fontSize: "0.9375rem",
            fontWeight: 400
          }}>
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </p>
        </div>

        <div style={{ padding: "0 2.5rem 2.5rem" }}>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: "1rem",
            marginBottom: "1.5rem",
            background: "#fee2e2",
            borderLeft: "4px solid #dc2626",
            borderRadius: "6px",
            color: "#991b1b",
            fontSize: "0.875rem",
            lineHeight: "1.5"
          }}>
            {error}
          </div>
        )}

        {/* Success Message for Password Reset */}
        {mode === "reset" && resetSent && (
          <div style={{
            padding: "1rem",
            marginBottom: "1.5rem",
            background: "#d1fae5",
            borderLeft: "4px solid #059669",
            borderRadius: "6px",
            color: "#065f46",
            fontSize: "0.875rem",
            lineHeight: "1.5"
          }}>
            Password reset email sent! Check your inbox.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  marginBottom: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "#374151"
                }}
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                autoComplete="email"
                placeholder="you@example.com"
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  fontSize: "1rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  outline: "none",
                  transition: "all 0.15s ease",
                  backgroundColor: "white"
                }}
                onFocus={(e) => e.target.style.borderColor = "#667eea"}
                onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
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
                    fontWeight: 500,
                    color: "#374151"
                  }}
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  minLength={6}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder="Enter your password"
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    fontSize: "1rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    outline: "none",
                    transition: "all 0.15s ease",
                    backgroundColor: "white"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#667eea"}
                  onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
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
                    fontWeight: 500,
                    color: "#374151"
                  }}
                >
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  minLength={6}
                  required
                  autoComplete="new-password"
                  placeholder="Confirm your password"
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    fontSize: "1rem",
                    border: "1px solid #d1d5db",
                    borderRadius: "8px",
                    outline: "none",
                    transition: "all 0.15s ease",
                    backgroundColor: "white"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#667eea"}
                  onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: "100%",
                marginTop: "0.5rem",
                padding: "0.875rem 1rem",
                fontSize: "1rem",
                fontWeight: 600,
                color: "white",
                background: isLoading ? "#9ca3af" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                border: "none",
                borderRadius: "8px",
                cursor: isLoading ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
                boxShadow: "0 4px 6px rgba(102, 126, 234, 0.25)"
              }}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
            >
              {isLoading ? (
                mode === "signin" ? "Signing in..." : mode === "signup" ? "Creating account..." : "Sending reset email..."
              ) : (
                mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"
              )}
            </button>
          </div>
        </form>

        {/* Forgot Password Link */}
        {mode === "signin" && (
          <div style={{
            textAlign: "center",
            marginTop: "1rem"
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
                color: "#667eea",
                fontSize: "0.875rem",
                cursor: "pointer",
                fontWeight: 500,
                textDecoration: "none"
              }}
              onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
              onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
            >
              Forgot your password?
            </button>
          </div>
        )}

        {/* Divider */}
        <div style={{
          position: "relative",
          margin: "1.5rem 0",
          height: "1px",
          background: "#e5e7eb"
        }}>
          <span style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "0 1rem",
            background: "white",
            color: "#9ca3af",
            fontSize: "0.75rem",
            fontWeight: 500
          }}>
            {mode === "reset" ? "OR" : mode === "signin" ? "OR" : "OR"}
          </span>
        </div>

        {/* Toggle Mode */}
        <div style={{
          textAlign: "center",
          fontSize: "0.875rem",
          color: "#6b7280"
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
                  color: "#667eea",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "inherit"
                }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              {mode === "signin" ? "New to Navigator?" : "Already have an account?"}{" "}
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
                  color: "#667eea",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "inherit"
                }}
                onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
              >
                {mode === "signin" ? "Create account" : "Sign in"}
              </button>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
