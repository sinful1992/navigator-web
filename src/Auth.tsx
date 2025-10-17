// src/Auth.tsx
import * as React from "react";

type Props = {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onClearError: () => void;
};

export function Auth({ onSignIn, onSignUp, onResetPassword, isLoading, error, onClearError }: Props) {
  const [mode, setMode] = React.useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [resetSent, setResetSent] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setValidationError(null);

    // Validate email
    if (!email || email.trim() === "") {
      setValidationError("Email is required");
      return;
    }

    if (!emailRegex.test(email)) {
      setValidationError("Please enter a valid email address");
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

    // Validate password
    if (!password || password.trim() === "") {
      setValidationError("Password is required");
      return;
    }

    if (password.length < 6) {
      setValidationError("Password must be at least 6 characters");
      return;
    }

    if (password.length > 72) {
      setValidationError("Password must be less than 72 characters");
      return;
    }

    // Check for common weak passwords
    const weakPasswords = ["password", "123456", "qwerty", "abc123", "password123"];
    if (weakPasswords.includes(password.toLowerCase())) {
      setValidationError("Please choose a stronger password");
      return;
    }

    if (mode === "signup") {
      if (!confirmPassword || confirmPassword.trim() === "") {
        setValidationError("Please confirm your password");
        return;
      }

      if (password !== confirmPassword) {
        setValidationError("Passwords do not match");
        return;
      }
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
    <div className="auth-container">
      <div className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <h1>Navigator</h1>
          <p>
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}
          </p>
        </div>

        <div className="auth-body">
          {/* Error Messages */}
          {(error || validationError) && (
            <div className="auth-error">
              {validationError || error}
            </div>
          )}

          {/* Success Message for Password Reset */}
          {mode === "reset" && resetSent && (
            <div className="auth-success">
              Password reset email sent! Check your inbox.
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            <div>
              <label htmlFor="email">Email address</label>
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
              />
            </div>

            {mode !== "reset" && (
              <div>
                <label htmlFor="password">Password</label>
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
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label htmlFor="confirmPassword">Confirm password</label>
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
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="auth-submit"
            >
              {isLoading ? (
                mode === "signin" ? "Signing in..." : mode === "signup" ? "Creating account..." : "Sending reset email..."
              ) : (
                mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"
              )}
            </button>
          </form>

          {/* Forgot Password Link */}
          {mode === "signin" && (
            <div className="auth-link-section">
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setResetSent(false);
                  onClearError();
                }}
                className="auth-link"
              >
                Forgot your password?
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="auth-divider">
            <span className="auth-divider-text">OR</span>
          </div>

          {/* Toggle Mode */}
          <div className="auth-toggle">
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
                  className="auth-link"
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
                  className="auth-link"
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
