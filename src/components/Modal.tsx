import * as React from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  showCloseButton?: boolean;
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = "md",
  showCloseButton = true 
}: ModalProps) {
  // Handle escape key
  React.useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Focus management
  const modalRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (isOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      if (firstElement) {
        firstElement.focus();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "modal-sm",
    md: "modal-md", 
    lg: "modal-lg"
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        ref={modalRef}
        className={`modal-content ${sizeClasses[size]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
      >
        {title && (
          <div className="modal-header">
            <h2 id="modal-title" className="modal-title">
              {title}
            </h2>
            {showCloseButton && (
              <button
                className="modal-close-btn"
                onClick={onClose}
                aria-label="Close modal"
              >
                ✕
              </button>
            )}
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
}

export function AlertModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  type = "info" 
}: AlertModalProps) {
  const typeConfig = {
    info: { icon: "ℹ️", className: "alert-info" },
    success: { icon: "✅", className: "alert-success" },
    warning: { icon: "⚠️", className: "alert-warning" },
    error: { icon: "❌", className: "alert-error" }
  };

  const config = typeConfig[type];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className={`alert-modal ${config.className}`}>
        <div className="alert-content">
          <div className="alert-icon">{config.icon}</div>
          <div className="alert-message">{message}</div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface ConfirmModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

export function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  type = "info"
}: ConfirmModalProps) {
  const typeConfig = {
    danger: { icon: "🗑️", confirmClass: "btn-danger" },
    warning: { icon: "⚠️", confirmClass: "btn-warning" },
    info: { icon: "ℹ️", confirmClass: "btn-primary" }
  };

  const config = typeConfig[type];

  const handleConfirm = () => {
    onConfirm();
    onCancel(); // Close modal
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
      <div className="confirm-modal">
        <div className="confirm-content">
          <div className="confirm-icon">{config.icon}</div>
          <div className="confirm-message">{message}</div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>
            {cancelText}
          </button>
          <button className={`btn ${config.confirmClass}`} onClick={handleConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface PromptModalProps {
  isOpen: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: "text" | "number" | "tel" | "email";
  submitText?: string;
  cancelText?: string;
}

export function PromptModal({
  isOpen,
  onSubmit,
  onCancel,
  title,
  message,
  placeholder,
  defaultValue = "",
  inputType = "text",
  submitText = "Submit",
  cancelText = "Cancel"
}: PromptModalProps) {
  const [value, setValue] = React.useState(defaultValue);

  // Reset value when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
      onCancel(); // Close modal
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
      <form onSubmit={handleSubmit}>
        <div className="prompt-modal">
          <div className="prompt-message">{message}</div>
          <input
            name="modalInput"
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="input"
            autoFocus
            required
          />
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {cancelText}
            </button>
            <button type="submit" className="btn btn-primary">
              {submitText}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}