import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Deployer, DeployContext, DeployResult } from "../types";

export class FilesDeployer implements Deployer {
  async deploy(ctx: DeployContext): Promise<DeployResult> {
    const { dataDir, graphJson, timestamp } = ctx;
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "graph.json"), graphJson, "utf8");
    const snapshotDir = join(dataDir, "snapshots");
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(join(snapshotDir, `${timestamp.slice(0, 10)}.json`), graphJson, "utf8");
    return { success: true, message: `Files written to ${dataDir}` };
  }
}
