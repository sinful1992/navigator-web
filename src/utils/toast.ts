// Simple toast notification system
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  timestamp: number;
  duration?: number;
}

class ToastManager {
  private toasts: ToastMessage[] = [];
  private listeners: Array<(toasts: ToastMessage[]) => void> = [];

  show(message: string, type: ToastType = 'info', duration = 4000) {
    const toast: ToastMessage = {
      id: `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      message,
      type,
      timestamp: Date.now(),
      duration
    };

    this.toasts.push(toast);
    this.notifyListeners();

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.remove(toast.id);
      }, duration);
    }

    return toast.id;
  }

  remove(id: string) {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
    this.notifyListeners();
  }

  clear() {
    this.toasts = [];
    this.notifyListeners();
  }

  getToasts(): ToastMessage[] {
    return [...this.toasts];
  }

  subscribe(listener: (toasts: ToastMessage[]) => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.toasts]));
  }
}

// Global toast manager instance
export const toast = new ToastManager();

// Helper methods for common toast types
export const showSuccess = (message: string, duration?: number) =>
  toast.show(message, 'success', duration);

export const showError = (message: string, duration?: number) =>
  toast.show(message, 'error', duration);

export const showWarning = (message: string, duration?: number) =>
  toast.show(message, 'warning', duration);

export const showInfo = (message: string, duration?: number) =>
  toast.show(message, 'info', duration);