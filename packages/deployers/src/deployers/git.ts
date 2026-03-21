import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Deployer, DeployContext, DeployResult } from "../types";

export class GitDeployer implements Deployer {
  constructor(
    private readonly opts: {
      commitMessage?: string;
      authorName?: string;
      authorEmail?: string;
    } = {}
  ) {}

  async deploy(ctx: DeployContext): Promise<DeployResult> {
    const { dataDir, graphJson, timestamp } = ctx;

    // Write graph.json
    writeFileSync(join(dataDir, "graph.json"), graphJson, "utf8");

    // Write timestamped snapshot
    const snapshotDir = join(dataDir, "snapshots");
    mkdirSync(snapshotDir, { recursive: true });
    const snapshotDate = timestamp.slice(0, 10); // YYYY-MM-DD
    writeFileSync(join(snapshotDir, `${snapshotDate}.json`), graphJson, "utf8");

    const message =
      this.opts.commitMessage ??
      `chore: update architecture graph [${timestamp.slice(0, 10)}]`;
    const name = this.opts.authorName ?? "archmap-bot";
    const email =
      this.opts.authorEmail ?? "archmap-bot@users.noreply.github.com";

    try {
      execSync(`git config user.name "${name}"`, { stdio: "inherit" });
      execSync(`git config user.email "${email}"`, { stdio: "inherit" });
      execSync(`git add "${dataDir}"`, { stdio: "inherit" });

      // Only commit if there are staged changes
      const status = execSync("git status --porcelain data/").toString().trim();
      if (!status) {
        return { success: true, message: "No changes to commit" };
      }

      execSync(`git commit -m "${message}"`, { stdio: "inherit" });
      execSync("git push", { stdio: "inherit" });

      return { success: true, message: "Committed and pushed graph data" };
    } catch (err) {
      return {
        success: false,
        message: "Git deploy failed",
        details: { error: String(err) },
      };
    }
  }
}
