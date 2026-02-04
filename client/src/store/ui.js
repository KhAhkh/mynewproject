import { create } from "zustand";

export const useModalStore = create((set) => ({
  modal: null,
  data: null,
  openModal: (modal, data = null) => set({ modal, data }),
  closeModal: () => set({ modal: null, data: null })
}));
