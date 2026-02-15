
export type ToastType = 'info' | 'success' | 'warning' | 'error';

export class Toast {
  private static container: HTMLDivElement | null = null;

  private static init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';

      // Use Popover API to sit on Top Layer (above <dialog>)
      try {
        this.container.setAttribute('popover', 'manual');
        document.body.appendChild(this.container);
        // Cast to any to avoid TS errors if lib "dom" is old
        (this.container as any).showPopover();
      } catch {
        // Fallback
        if (!this.container.isConnected) document.body.appendChild(this.container);
      }
    }
  }

  static show(message: string, type: ToastType = 'info', duration = 3000) {
    this.init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // Limit visible toasts
    if (this.container!.childElementCount >= 3) {
      if (this.container!.firstChild) {
        this.container!.firstChild.remove();
      }
    }

    this.container!.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      // Check if attached before removing (might have been removed by limit logic)
      if (toast.isConnected) {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => {
          toast.remove();
        });
      }
    }, duration);
  }

  static info(msg: string) { this.show(msg, 'info'); }
  static success(msg: string) { this.show(msg, 'success'); }
  static warning(msg: string) { this.show(msg, 'warning'); }
  static error(msg: string) { this.show(msg, 'error'); }
}
