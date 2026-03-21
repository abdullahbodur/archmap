export interface DeployContext {
  /** Absolute path to the data directory (contains graph.json and snapshots/) */
  dataDir: string;
  /** Serialized graph JSON to write */
  graphJson: string;
  /** ISO timestamp used for snapshot filename */
  timestamp: string;
}

export interface DeployResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface Deployer {
  deploy(ctx: DeployContext): Promise<DeployResult>;
}
