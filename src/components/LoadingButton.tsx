import * as React from "react";

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export function LoadingButton({ 
  isLoading = false, 
  loadingText = "Loading...",
  children, 
  disabled,
  ...props 
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={`${props.className || ''} ${isLoading ? 'btn-loading' : ''}`.trim()}
    >
      {isLoading && (
        <span className="loading-spinner" aria-hidden="true">
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 16 16" 
            className="spinner-icon"
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="37.7"
              strokeDashoffset="37.7"
            />
          </svg>
        </span>
      )}
      <span className={isLoading ? 'loading-text' : ''}>
        {isLoading ? loadingText : children}
      </span>
    </button>
  );
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export function LoadingSpinner({ 
  size = "md", 
  text, 
  className = "" 
}: LoadingSpinnerProps) {
  const sizeMap = {
    sm: "16",
    md: "24", 
    lg: "32"
  };

  const spinnerSize = sizeMap[size];

  return (
    <div className={`loading-spinner-container ${className}`}>
      <svg 
        width={spinnerSize}
        height={spinnerSize}
        viewBox="0 0 24 24" 
        className="loading-spinner-icon"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="56.5"
          strokeDashoffset="56.5"
        />
      </svg>
      {text && <span className="loading-text">{text}</span>}
    </div>
  );
}

interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
  children: React.ReactNode;
}

export function LoadingOverlay({ 
  isLoading, 
  text = "Loading...", 
  children 
}: LoadingOverlayProps) {
  return (
    <div className="loading-overlay-container">
      {children}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-overlay-content">
            <LoadingSpinner size="lg" text={text} />
          </div>
        </div>
      )}
    </div>
  );
}