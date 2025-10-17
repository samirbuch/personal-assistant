export default class ResettableAbortController {
  private controller: AbortController = new AbortController();
  private _signal: AbortSignal;
  private isReset: boolean = false;

  constructor() {
    this._signal = this.createProxiedSignal();
  }

  private createProxiedSignal(): AbortSignal {
    const self = this;
    return new Proxy(this.controller.signal, {
      get(target, prop) {
        if (prop === 'aborted') {
          // If reset, return false even if underlying signal is aborted
          return self.isReset ? false : self.controller.signal.aborted;
        }
        if (prop === 'reason') {
          return self.isReset ? undefined : self.controller.signal.reason;
        }
        if (prop === 'addEventListener') {
          // Redirect to current controller's signal
          return self.controller.signal.addEventListener.bind(self.controller.signal);
        }
        if (prop === 'removeEventListener') {
          return self.controller.signal.removeEventListener.bind(self.controller.signal);
        }
        if (prop === 'dispatchEvent') {
          return self.controller.signal.dispatchEvent.bind(self.controller.signal);
        }
        return (self.controller.signal as any)[prop];
      }
    });
  }

  public abort(reason?: any) {
    this.isReset = false;
    return this.controller.abort(reason);
  }

  get signal() {
    return this._signal;
  }

  public reset() {
    this.isReset = true;
    this.controller = new AbortController();
  }
}