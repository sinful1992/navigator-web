import * as React from "react";
import { AlertModal, ConfirmModal, PromptModal } from "./Modal";
import { useModals } from "../hooks/useModals";
import "./modal.css";

interface ModalProviderProps {
  children: React.ReactNode;
}

const ModalsContext = React.createContext<ReturnType<typeof useModals> | null>(null);

export function ModalProvider({ children }: ModalProviderProps) {
  const modals = useModals();

  return (
    <ModalsContext.Provider value={modals}>
      {children}
      
      {/* Alert Modal */}
      <AlertModal
        isOpen={modals.alertModal.isOpen}
        onClose={modals.closeAlert}
        title={modals.alertModal.options.title}
        message={modals.alertModal.options.message}
        type={modals.alertModal.options.type}
      />
      
      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={modals.confirmModal.isOpen}
        onConfirm={() => modals.closeConfirm(true)}
        onCancel={() => modals.closeConfirm(false)}
        title={modals.confirmModal.options.title}
        message={modals.confirmModal.options.message}
        confirmText={modals.confirmModal.options.confirmText}
        cancelText={modals.confirmModal.options.cancelText}
        type={modals.confirmModal.options.type}
      />
      
      {/* Prompt Modal */}
      <PromptModal
        isOpen={modals.promptModal.isOpen}
        onSubmit={(value) => modals.closePrompt(value)}
        onCancel={() => modals.closePrompt(null)}
        title={modals.promptModal.options.title}
        message={modals.promptModal.options.message}
        placeholder={modals.promptModal.options.placeholder}
        defaultValue={modals.promptModal.options.defaultValue}
        inputType={modals.promptModal.options.inputType}
        submitText={modals.promptModal.options.submitText}
        cancelText={modals.promptModal.options.cancelText}
      />
    </ModalsContext.Provider>
  );
}

export function useModalContext() {
  const context = React.useContext(ModalsContext);
  if (!context) {
    throw new Error("useModalContext must be used within a ModalProvider");
  }
  return context;
}