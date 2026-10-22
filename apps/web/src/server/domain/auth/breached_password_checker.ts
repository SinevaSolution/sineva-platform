export interface BreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>;
}

export class FakeBreachedPasswordChecker implements BreachedPasswordChecker {
  private knownBreached: Set<string>;

  constructor(knownBreached: string[] = []) {
    this.knownBreached = new Set(knownBreached);
  }

  async isBreached(password: string): Promise<boolean> {
    return this.knownBreached.has(password);
  }

  addBreached(password: string): void {
    this.knownBreached.add(password);
  }
}
