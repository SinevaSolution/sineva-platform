export interface DatabaseHealthProbe {
  ping(): Promise<boolean>;
}
