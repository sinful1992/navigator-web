import * as React from "react";

interface AlertOptions {
  title?: string;
  message: string;
  type?: "info" | "success" | "warning" | "error";
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
}

interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  inputType?: "text" | "number" | "tel" | "email";
  submitText?: string;
  cancelText?: string;
}

interface ModalState {
  alert: {
    isOpen: boolean;
    options: AlertOptions;
    resolve?: () => void;
  };
  confirm: {
    isOpen: boolean;
    options: ConfirmOptions;
    resolve?: (confirmed: boolean) => void;
  };
  prompt: {
    isOpen: boolean;
    options: PromptOptions;
    resolve?: (value: string | null) => void;
  };
}

const initialState: ModalState = {
  alert: {
    isOpen: false,
    options: { message: "" }
  },
  confirm: {
    isOpen: false,
    options: { message: "" }
  },
  prompt: {
    isOpen: false,
    options: { message: "" }
  }
};

export function useModals() {
  const [state, setState] = React.useState<ModalState>(initialState);

  const alert = React.useCallback((options: AlertOptions): Promise<void> => {
    return new Promise((resolve) => {
      setState(prev => ({
        ...prev,
        alert: {
          isOpen: true,
          options,
          resolve
        }
      }));
    });
  }, []);

  const confirm = React.useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState(prev => ({
        ...prev,
        confirm: {
          isOpen: true,
          options,
          resolve
        }
      }));
    });
  }, []);

  const prompt = React.useCallback((options: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setState(prev => ({
        ...prev,
        prompt: {
          isOpen: true,
          options,
          resolve
        }
      }));
    });
  }, []);

  const closeAlert = React.useCallback(() => {
    setState(prev => {
      if (prev.alert.resolve) {
        prev.alert.resolve();
      }
      return {
        ...prev,
        alert: { ...initialState.alert }
      };
    });
  }, []);

  const closeConfirm = React.useCallback((confirmed: boolean = false) => {
    setState(prev => {
      if (prev.confirm.resolve) {
        prev.confirm.resolve(confirmed);
      }
      return {
        ...prev,
        confirm: { ...initialState.confirm }
      };
    });
  }, []);

  const closePrompt = React.useCallback((value: string | null = null) => {
    setState(prev => {
      if (prev.prompt.resolve) {
        prev.prompt.resolve(value);
      }
      return {
        ...prev,
        prompt: { ...initialState.prompt }
      };
    });
  }, []);

  return {
    // Modal states
    alertModal: state.alert,
    confirmModal: state.confirm,
    promptModal: state.prompt,
    
    // Modal functions
    alert,
    confirm,
    prompt,
    
    // Close functions
    closeAlert,
    closeConfirm,
    closePrompt
  };
}

// Convenience functions that match the original browser APIs
export function useReplaceBrowserModals() {
  const modals = useModals();

  const customAlert = React.useCallback(async (message: string) => {
    await modals.alert({ message, type: "info" });
  }, [modals]);

  const customConfirm = React.useCallback(async (message: string): Promise<boolean> => {
    return await modals.confirm({ message, type: "info" });
  }, [modals]);

  const customPrompt = React.useCallback(async (
    message: string, 
    defaultValue?: string
  ): Promise<string | null> => {
    return await modals.prompt({ message, defaultValue });
  }, [modals]);

  return {
    ...modals,
    // Browser-compatible replacements
    alert: customAlert,
    confirm: customConfirm,
    prompt: customPrompt
  };
}