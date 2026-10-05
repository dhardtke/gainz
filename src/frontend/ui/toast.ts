import { ApiError, errorMessage } from '../http/errors.ts';

export type ToastKind = 'info' | 'success' | 'error';

declare global {
  interface Window {
    /** Oat's JavaScript API. index.html loads oat.js, deferred, before any module runs. */
    ot: {
      toast: (message: string, title?: string, options?: { variant?: string; placement?: string; duration?: number }) => HTMLElement;
    };
  }
}

/** Shows a transient message. Any module can call this without a DOM reference. */
export function toast(message: string, kind: ToastKind = 'info'): void {
  window.ot.toast(message, undefined, {
    variant: kind === 'error' ? 'danger' : kind,
    placement: 'bottom-right',
    duration: kind === 'error' ? 6000 : 3000,
  });
}

/** Reports a failed API call in the user's terms. */
export function toastError(error: unknown): void {
  // Not logged in: the app sends the user to the login page instead, which says enough.
  if (error instanceof ApiError && error.status === 401) {
    return;
  }
  toast(errorMessage(error), 'error');
}
