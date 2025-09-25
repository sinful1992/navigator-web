import React from 'react';
import { toast, type ToastMessage } from '../utils/toast';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  React.useEffect(() => {
    const unsubscribe = toast.subscribe(setToasts);
    return unsubscribe;
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={`toast toast-${toastItem.type}`}
          onClick={() => toast.remove(toastItem.id)}
        >
          <div className="toast-content">
            <span className="toast-icon">
              {toastItem.type === 'success' && '✅'}
              {toastItem.type === 'error' && '❌'}
              {toastItem.type === 'warning' && '⚠️'}
              {toastItem.type === 'info' && 'ℹ️'}
            </span>
            <span className="toast-message">{toastItem.message}</span>
          </div>
        </div>
      ))}

      <style>{`
        .toast-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 8px;
          pointer-events: none;
        }

        .toast {
          pointer-events: auto;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          border-left: 4px solid;
          min-width: 300px;
          max-width: 400px;
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.3s ease;
          animation: slideIn 0.3s ease-out;
        }

        .toast:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
        }

        .toast-success {
          border-left-color: #22c55e;
          background: #f0fdf4;
        }

        .toast-error {
          border-left-color: #ef4444;
          background: #fef2f2;
        }

        .toast-warning {
          border-left-color: #f59e0b;
          background: #fffbeb;
        }

        .toast-info {
          border-left-color: #3b82f6;
          background: #eff6ff;
        }

        .toast-content {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toast-icon {
          font-size: 16px;
        }

        .toast-message {
          color: #374151;
          font-weight: 500;
          flex: 1;
          line-height: 1.4;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @media (max-width: 768px) {
          .toast-container {
            top: 10px;
            right: 10px;
            left: 10px;
          }

          .toast {
            min-width: auto;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
};